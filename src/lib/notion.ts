import { Client } from '@notionhq/client';

type NotionTitleItem = {
  plain_text?: string;
};

type NotionIcon =
  | {
      type: 'emoji';
      emoji: string;
    }
  | {
      type: 'external';
      external: {
        url: string;
      };
    }
  | null;

type NotionPropertyResponse = {
  id?: string;
  name?: string;
  type: string;
};

type NotionDatabaseResponse = {
  id: string;
  title?: NotionTitleItem[];
  icon?: NotionIcon;
  properties: Record<string, NotionPropertyResponse>;
};

type DatabaseConnectionResult = {
  database: Database;
  suggestedMapping: TransactionsFieldMapping | null;
};

const BALANCE_REQUIRED_FIELDS = ['Account Name', 'Balance', 'Date'] as const;
const TRANSACTION_REQUIRED_FIELDS = ['Date', 'Amount', 'Merchant/Description', 'Account Name'] as const;
export const TRANSACTION_SYNC_ID_PROPERTY = 'Sync ID';

const BALANCE_AUTO_PROPERTIES = {
  Balance: { number: { format: 'dollar' } },
  Date: { date: {} },
} as const;

const TRANSACTION_AUTO_PROPERTIES = {
  Amount: { number: { format: 'dollar' } },
  Date: { date: {} },
  'Account Name': { rich_text: {} },
  [TRANSACTION_SYNC_ID_PROPERTY]: { rich_text: {} },
} as const;

const normalizeNotionId = (value: string): string => {
  const compact = value.replace(/-/g, '').toLowerCase();
  if (compact.length !== 32) {
    return value;
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20, 32),
  ].join('-');
};

const titleFromDatabase = (title: NotionTitleItem[] | undefined): string => {
  const plainTitle = title?.map((item) => item.plain_text ?? '').join('').trim();
  return plainTitle || 'Untitled database';
};

const mapProperties = (properties: Record<string, NotionPropertyResponse>): DatabaseProperty[] =>
  Object.entries(properties).map(([fallbackName, property]) => ({
    id: property.id ?? fallbackName,
    name: property.name ?? fallbackName,
    type: property.type,
    badgeClass:
      property.type === 'title'
        ? 'bg-blue-100 text-blue-800'
        : property.type === 'date'
          ? 'bg-pink-100 text-pink-800'
          : property.type === 'number'
            ? 'bg-green-100 text-green-800'
            : property.type === 'rich_text'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-gray-100 text-gray-800',
  }));

const mapDatabase = (
  response: NotionDatabaseResponse,
  link: string,
  schemaStatus: DatabaseSchemaStatus,
): Database => ({
  id: response.id,
  title: titleFromDatabase(response.title),
  icon: response.icon?.type === 'external' ? response.icon.external.url : null,
  emoji: response.icon?.type === 'emoji' ? response.icon.emoji : null,
  properties: mapProperties(response.properties),
  link,
  schemaStatus,
});

const createClient = (apiKey: string): Client => new Client({ auth: apiKey.trim() });

const getDatabaseProperty = (database: Database, predicate: (property: DatabaseProperty) => boolean): DatabaseProperty | undefined =>
  database.properties.find(predicate);

const missingBalanceFields = (database: Database): string[] => {
  const missing: string[] = [];

  if (!database.properties.some((property) => property.type === 'title')) {
    missing.push('Account Name');
  }
  if (!database.properties.some((property) => property.type === 'number')) {
    missing.push('Balance');
  }
  if (!database.properties.some((property) => property.type === 'date')) {
    missing.push('Date');
  }

  return missing;
};

const missingTransactionsFields = (database: Database): string[] => {
  const missing: string[] = [];
  const titleProperties = database.properties.filter((property) => property.type === 'title');
  const richTextProperties = database.properties.filter((property) => property.type === 'rich_text');

  if (titleProperties.length === 0 && richTextProperties.length === 0) {
    missing.push('Merchant/Description');
  }
  if (!database.properties.some((property) => property.type === 'number')) {
    missing.push('Amount');
  }
  if (!database.properties.some((property) => property.type === 'date')) {
    missing.push('Date');
  }
  if (richTextProperties.length === 0 && titleProperties.length > 0) {
    missing.push('Account Name');
  }
  if (titleProperties.length === 0 && richTextProperties.length < 2) {
    missing.push('Account Name');
  }

  return missing;
};

const buildSchemaStatus = (
  kind: DatabaseKind,
  database: Database,
  autoCreatedFields: string[],
  notes: string[],
): DatabaseSchemaStatus => {
  const missingFields = kind === 'balance' ? missingBalanceFields(database) : missingTransactionsFields(database);

  return {
    isValid: missingFields.length === 0,
    missingFields,
    autoCreatedFields,
    notes,
  };
};

const findPropertyByName = (database: Database, name: string): DatabaseProperty | undefined =>
  getDatabaseProperty(database, (property) => property.name === name);

const findPropertyByType = (database: Database, type: string): DatabaseProperty | undefined =>
  getDatabaseProperty(database, (property) => property.type === type);

const buildDefaultTransactionsFieldMapping = (database: Database): TransactionsFieldMapping | null => {
  const titleProperty = database.properties.find((property) => property.type === 'title');
  const richTextProperties = database.properties.filter((property) => property.type === 'rich_text');
  const amountProperty = findPropertyByName(database, 'Amount') ?? findPropertyByType(database, 'number');
  const dateProperty = findPropertyByName(database, 'Date') ?? findPropertyByType(database, 'date');
  const merchantProperty =
    titleProperty ??
    findPropertyByName(database, 'Merchant') ??
    findPropertyByName(database, 'Description') ??
    richTextProperties[0];
  const accountNameProperty =
    findPropertyByName(database, 'Account Name') ??
    richTextProperties.find((property) => property.name !== merchantProperty?.name);

  if (!dateProperty || !amountProperty || !merchantProperty || !accountNameProperty) {
    return null;
  }

  const uniqueProperties = new Set([
    dateProperty.name,
    amountProperty.name,
    merchantProperty.name,
    accountNameProperty.name,
  ]);

  if (uniqueProperties.size !== 4) {
    return null;
  }

  return {
    dateProperty: dateProperty.name,
    amountProperty: amountProperty.name,
    merchantProperty: merchantProperty.name,
    accountNameProperty: accountNameProperty.name,
  };
};

const makeReadableError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return 'Unknown error';
};

const updateDatabaseProperties = async (
  notion: Client,
  databaseId: string,
  properties: Record<string, object>,
): Promise<void> => {
  if (Object.keys(properties).length === 0) {
    return;
  }

  await notion.databases.update({
    database_id: databaseId,
    properties,
  });
};

const retrieveDatabase = async (notion: Client, databaseId: string): Promise<NotionDatabaseResponse> =>
  (await notion.databases.retrieve({
    database_id: databaseId,
  })) as unknown as NotionDatabaseResponse;

const ensureBalanceSchema = async (
  notion: Client,
  link: string,
  response: NotionDatabaseResponse,
): Promise<Database> => {
  let mapped = mapDatabase(response, link, {
    isValid: false,
    missingFields: [],
    autoCreatedFields: [],
    notes: [],
  });
  const propertiesToCreate: Record<string, object> = {};
  const autoCreatedFields: string[] = [];
  const notes: string[] = [];

  if (!findPropertyByType(mapped, 'title')) {
    notes.push('Notion database is missing a title property and cannot be used for balance sync.');
  }
  if (!findPropertyByType(mapped, 'number')) {
    propertiesToCreate.Balance = BALANCE_AUTO_PROPERTIES.Balance;
    autoCreatedFields.push('Balance');
  }
  if (!findPropertyByType(mapped, 'date')) {
    propertiesToCreate.Date = BALANCE_AUTO_PROPERTIES.Date;
    autoCreatedFields.push('Date');
  }

  if (Object.keys(propertiesToCreate).length > 0) {
    await updateDatabaseProperties(notion, mapped.id, propertiesToCreate);
    mapped = mapDatabase(await retrieveDatabase(notion, mapped.id), link, {
      isValid: false,
      missingFields: [],
      autoCreatedFields: [],
      notes: [],
    });
  }

  mapped.schemaStatus = buildSchemaStatus('balance', mapped, autoCreatedFields, notes);
  return mapped;
};

const ensureTransactionsSchema = async (
  notion: Client,
  link: string,
  response: NotionDatabaseResponse,
): Promise<Database> => {
  let mapped = mapDatabase(response, link, {
    isValid: false,
    missingFields: [],
    autoCreatedFields: [],
    notes: [],
  });
  const propertiesToCreate: Record<string, object> = {};
  const autoCreatedFields: string[] = [];

  if (!findPropertyByType(mapped, 'number')) {
    propertiesToCreate.Amount = TRANSACTION_AUTO_PROPERTIES.Amount;
    autoCreatedFields.push('Amount');
  }
  if (!findPropertyByType(mapped, 'date')) {
    propertiesToCreate.Date = TRANSACTION_AUTO_PROPERTIES.Date;
    autoCreatedFields.push('Date');
  }
  if (!findPropertyByName(mapped, 'Account Name')) {
    propertiesToCreate['Account Name'] = TRANSACTION_AUTO_PROPERTIES['Account Name'];
    autoCreatedFields.push('Account Name');
  }
  if (!findPropertyByName(mapped, TRANSACTION_SYNC_ID_PROPERTY)) {
    propertiesToCreate[TRANSACTION_SYNC_ID_PROPERTY] = TRANSACTION_AUTO_PROPERTIES[TRANSACTION_SYNC_ID_PROPERTY];
    autoCreatedFields.push(TRANSACTION_SYNC_ID_PROPERTY);
  }

  if (Object.keys(propertiesToCreate).length > 0) {
    await updateDatabaseProperties(notion, mapped.id, propertiesToCreate);
    mapped = mapDatabase(await retrieveDatabase(notion, mapped.id), link, {
      isValid: false,
      missingFields: [],
      autoCreatedFields: [],
      notes: [],
    });
  }

  const notes: string[] = [];
  if (!findPropertyByType(mapped, 'title')) {
    notes.push('Transactions database should keep one title property for Merchant/Description.');
  }
  if (!findPropertyByType(mapped, 'title') && !findPropertyByType(mapped, 'rich_text')) {
    notes.push('No text field is available for Merchant/Description.');
  }

  mapped.schemaStatus = buildSchemaStatus('transactions', mapped, autoCreatedFields, notes);
  return mapped;
};

export const parseNotionDatabaseId = (link: string): string | null => {
  const matches = link.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);

  if (!matches?.length) {
    return null;
  }

  return normalizeNotionId(matches[0]);
};

export const connectNotionDatabase = async (
  apiKey: string,
  link: string,
  kind: DatabaseKind,
): Promise<DatabaseConnectionResult> => {
  const notion = createClient(apiKey);
  const databaseId = parseNotionDatabaseId(link);

  if (!databaseId) {
    throw new Error('Could not parse a database id from the provided Notion link.');
  }

  const response = await retrieveDatabase(notion, databaseId);
  const database =
    kind === 'balance'
      ? await ensureBalanceSchema(notion, link, response)
      : await ensureTransactionsSchema(notion, link, response);

  return {
    database,
    suggestedMapping: kind === 'transactions' ? buildDefaultTransactionsFieldMapping(database) : null,
  };
};

export const getCompatibleProperties = (
  database: Database | null,
  types: string[],
): DatabaseProperty[] => {
  if (!database) {
    return [];
  }

  return database.properties.filter((property) => types.includes(property.type));
};

export const validateTransactionsFieldMapping = (
  mapping: TransactionsFieldMapping | null,
  database: Database | null,
): string[] => {
  if (!database) {
    return [];
  }

  if (!mapping) {
    return ['Field mapping is required for the transactions database.'];
  }

  const rules: Array<[keyof TransactionsFieldMapping, string[]]> = [
    ['dateProperty', ['date']],
    ['amountProperty', ['number']],
    ['merchantProperty', ['title', 'rich_text']],
    ['accountNameProperty', ['rich_text']],
  ];
  const errors: string[] = [];

  for (const [field, allowedTypes] of rules) {
    const propertyName = mapping[field];
    if (!propertyName) {
      errors.push(`${field} is required.`);
      continue;
    }

    const property = findPropertyByName(database, propertyName);
    if (!property) {
      errors.push(`${propertyName} is no longer available in the database.`);
      continue;
    }

    if (!allowedTypes.includes(property.type)) {
      errors.push(`${propertyName} has type ${property.type}, expected ${allowedTypes.join(' or ')}.`);
    }
  }

  const uniqueProperties = new Set(Object.values(mapping).filter(Boolean));
  if (uniqueProperties.size !== Object.values(mapping).filter(Boolean).length) {
    errors.push('Each transactions field must map to a different Notion property.');
  }

  return errors;
};

export const formatNotionError = (error: unknown): string => {
  const message = makeReadableError(error);

  if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string') {
    return `Notion [${error.code}]: ${message}`;
  }

  return message;
};

export const requiredFieldsFor = (kind: DatabaseKind): readonly string[] =>
  kind === 'balance' ? BALANCE_REQUIRED_FIELDS : TRANSACTION_REQUIRED_FIELDS;

export const ensureTransactionsSyncIdProperty = async (
  notion: Client,
  database: Database,
): Promise<Database> => {
  if (findPropertyByName(database, TRANSACTION_SYNC_ID_PROPERTY)) {
    return database;
  }

  await updateDatabaseProperties(notion, database.id, {
    [TRANSACTION_SYNC_ID_PROPERTY]: TRANSACTION_AUTO_PROPERTIES[TRANSACTION_SYNC_ID_PROPERTY],
  });

  const response = await retrieveDatabase(notion, database.id);
  const schemaStatus = database.schemaStatus ?? {
    isValid: true,
    missingFields: [],
    autoCreatedFields: [],
    notes: [],
  };
  const updated = mapDatabase(response, database.link, schemaStatus);
  updated.schemaStatus = {
    ...schemaStatus,
    autoCreatedFields: Array.from(new Set([...schemaStatus.autoCreatedFields, TRANSACTION_SYNC_ID_PROPERTY])),
  };
  return updated;
};
