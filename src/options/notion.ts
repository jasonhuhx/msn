import { Client } from '@notionhq/client';
import { DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints';
export default () => ({
  error: '',
  onLoading: false,
  databaseList: [] as Database[],
  async init() {
    // const { notionApiKey = '' } = await chrome.storage.local.get(['notionApiKey']);
    // this.notionApiKey = notionApiKey;
  },
  showDatabaseList() {
    return this.databaseList.length;
  },
  showSelectedDB() {
    return this.$data.selectedDatabase && !this.databaseList.length;
  },
  getBtnClassName() {
    return this.onLoading ? 'animate-pulse cursor-not-allowed' : '';
  },
  getPropertyClassName() {
    switch (this.$data.property.type) {
      case 'title':
        return 'bg-blue-100 text-blue-800';
      case 'date':
        return 'bg-pink-100 text-pink-800';
      case 'number':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  },
  onApiChange() {
    this.error = '';
    this.notionApiKey = this.$el.value;
    if (this.notionApiKey.length < 20) {
      this.error = 'wrong type Notion API key.';
    }
  },
  isChecked() {
    return this.selectedDatabase?.id === this.$el.value;
  },
  onCheckBoxChange() {
    this.error = '';
    this.buttonTitle = 'Save';
    this.selectedDatabase = (this.databaseList as Database[]).find((db) => db.id === this.$el.value);
  },
  async onScan() {
    try {
      this.onLoading = true;
      const notion = new Client({ auth: this.$data.notionApiKey });
      const notionRts = await notion.search({
        filter: {
          property: 'object',
          value: 'database',
        },
      });
      const dbList = (notionRts.results as DatabaseObjectResponse[]).map((db) => {
        const properties = db.properties;
        return {
          id: db.id,
          title: db.title[0].plain_text,
          icon: db.icon?.type === 'external' ? db.icon.external.url : null,
          emoji: db.icon?.type === 'emoji' ? db.icon.emoji : null,
          properties: Object.entries(properties).map(([, value]) => ({
            type: value.type,
            name: value.name,
          })),
        };
      }) as Database[];
      console.log(dbList);
      if (dbList.length === 0) {
        this.error = 'No databases found';
      }
      this.databaseList = dbList;
      this.onLoading = false;
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('on-notion-error', {
          detail: `Notion [${error.code}]: ${error.message}`,
        }),
      );
    }
  },
  errorHandling(event) {
    this.error = event.detail;
    this.onLoading = false;
  },
});
