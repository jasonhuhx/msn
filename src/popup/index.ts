import Alpine from '@alpinejs/csp';
import { Client } from '@notionhq/client';

import '../global.css';
window.Alpine = Alpine;

const parseCurrency = (str: string): number => parseFloat(str.replace(/[^0-9.-]+/g, ''));
Alpine.data('popup', () => ({
  filteredAccts: [],
  isLoading: false,
  error: '',
  selectedDatabase: {},
  notionApiKey: undefined,
  selectedDatabaseName: '',
  syncBtn: {
    title: 'Sync to Notion',
    span: '',
  },
  async init() {
    const { selectedDatabase = {} } = await chrome.storage.local.get(['selectedDatabase']);
    const { notionApiKey } = await chrome.storage.local.get(['notionApiKey']);
    this.notionApiKey = notionApiKey;
    this.selectedDatabase = selectedDatabase;
    this.selectedDatabaseName = selectedDatabase ? selectedDatabase.title : '';
    this.syncBtn.span = this.selectedDatabase ? `database://${this.selectedDatabase.title}` : '';
  },
  syncBtnText() {
    return this.isLoading ? 'Syncing...' : this.syncBtn.title;
  },
  errorHandling(event) {
    console.log('onErr', event);
    this.error = event.detail;
    this.isLoading = false;
  },
  onLoading() {
    this.isLoading = true;
    this.error = '';
  },
  afterUpdate(event) {
    console.log('after-update', event.detail);
    this.filteredAccts = event.detail;
    this.isLoading = false;
  },
  onOpenSettings() {
    this.isLoading = false;
    this.error = '';
    chrome.runtime.openOptionsPage();
  },
  async onSync() {
    this.isLoading = true;
    this.error = '';
    this.syncBtn.title = 'Syncing...';
    this.onLoading = true;
    //TODO: consider move Notion Client to out Alpine function?
    let notion: Client;
    try {
      notion = new Client({ auth: this.notionApiKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.dispatchEvent(
        new CustomEvent('on-error', {
          detail: `Notion client init failed: ${message}`,
        }),
      );
      this.isLoading = false;
      this.syncBtn.title = 'Sync to Notion';
      return;
    }
    const titleKey = this.selectedDatabase.properties?.find((prop) => prop.type === 'title')?.name;
    const balanceKey = this.selectedDatabase.properties?.find((prop) => prop.type === 'number')?.name;
    const dateKey = this.selectedDatabase.properties?.find((prop) => prop.type === 'date')?.name;

    const results = await Promise.all(
      this.filteredAccts.map((acct) => {
        return notion.pages.create({
          parent: {
            database_id: this.selectedDatabase.id,
          },
          properties: {
            [titleKey]: {
              type: 'title',
              title: [
                {
                  type: 'text',
                  text: {
                    content: acct.name,
                  },
                },
              ],
            },
            [balanceKey]: {
              type: 'number',
              number: parseCurrency(acct.balance),
            },
            [dateKey]: {
              type: 'date',
              date: {
                start: new Date().toISOString(),
              },
            },
          },
        });
      }),
    );
    console.log(results);
    this.syncBtn.title = 'Synced';
    window.dispatchEvent(new CustomEvent('after-update', {}));
  },
}));
Alpine.start();
const syncAccountTypesFromPage = () => {
  const accountGroups = document.querySelectorAll('.account-groups-container');
  const accountTypes: Record<string, string> = {};

  accountGroups.forEach((group) => {
    const headerElement = group.querySelector('.account-groups-header h2');
    const groupClass: string = group.classList[1]; // We are assuming the second class is the account type (e.g., 'deposit-accounts')
    const groupTitle = (headerElement as HTMLElement)?.innerText.trim();
    if (groupTitle && groupClass) {
      // Save the class and title in the key-value format
      accountTypes[groupClass] = groupTitle;
    }
  });

  return accountTypes;
};

const getAllAccounts = (selectedTypes: Array<string>) => {
  // const stored = await chrome.storage.local.get('selectedNames');
  // const selectedNames = stored.selectedNames || [];
  const selector = selectedTypes.map((className) => `.account-groups-container.${className} .card-container`).join(',');
  const cardContainers = document.querySelectorAll(selector);
  const accounts: Account[] = [];

  cardContainers.forEach((container) => {
    const nameElement = container.querySelector('.account-name span');
    const balanceElement = container.querySelector('.account-balance p');

    const name = nameElement ? nameElement.innerText.trim() : 'No name found';
    const balance = balanceElement ? balanceElement.innerText.trim() : 'No balance found';

    accounts.push({ name, balance });
  });
  return accounts;
};
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];

  // Check if the current tab's domain matches the expected target domain
  const targetDomain = 'cibconline.cibc.com'; // Replace with the domain you're targeting
  const currentDomain = new URL(currentTab.url!).hostname;
  // If the current tab's domain doesn't match the target domain, show an error message
  if (!currentDomain.includes(targetDomain)) {
    window.dispatchEvent(
      new CustomEvent('on-error', {
        detail: `Error: This is not the correct domain. Expected domain: ${targetDomain}`,
      }),
    );
    return; // Stop further execution
  }
  // window.dispatchEvent(new CustomEvent("on-loading"));
  chrome.scripting.executeScript(
    {
      target: { tabId: tabs[0].id! },
      func: syncAccountTypesFromPage,
    },
    async (results) => {
      if (chrome.runtime.lastError) {
        window.dispatchEvent(
          new CustomEvent('on-error', {
            detail: `Error: ${chrome.runtime.lastError.message}`,
          }),
        );
        return;
      }
      const availableAccounts = results?.[0]?.result;
      if (!availableAccounts) {
        document.getElementById('amount')!.innerText = 'Error: unable to find account sections';
        return;
      }
      chrome.storage.local.set({ availableAccounts });
      const { selectedAccounts = Object.keys(availableAccounts) } = await chrome.storage.local.get('selectedAccounts');
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id! },
          func: getAllAccounts,
          args: [selectedAccounts],
        },
        async (results) => {
          if (chrome.runtime.lastError) {
            window.dispatchEvent(
              new CustomEvent('on-error', {
                detail: `Error: ${chrome.runtime.lastError.message}`,
              }),
            );
            return;
          }
          const accounts = results?.[0]?.result as Account[];
          window.dispatchEvent(
            new CustomEvent('after-update', {
              detail: accounts,
            }),
          );
        },
      );
    },
  );
});
