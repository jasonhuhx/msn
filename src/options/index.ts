import Alpine from '@alpinejs/csp';
import notion from './notion';
import '../global.css';
window.Alpine = Alpine;
type AvailableAccount = { className: string; title: string };
type SelectedAccount = AvailableAccount['className'];
Alpine.data('notion', notion);
Alpine.data('accountOptions', () => ({
  availableAccounts: [] as AvailableAccount[], // [{className: 'deposit-accounts', title: 'Deposit Accounts'}, ...]
  selectedAccounts: [] as SelectedAccount[], // ['deposit-accounts', 'savings-accounts']
  buttonTitle: 'Save',
  selectedDatabase: null,
  notionApiKey: null,
  getClassName() {
    return this.$data.index === this.availableAccounts.length - 1
      ? 'w-full dark:border-gray-600'
      : 'w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600';
  },
  getCheckBoxId() {
    return `checkbox-${this.$data.account.className}`;
  },
  isChecked() {
    return this.selectedAccounts.includes(this.$el.value);
  },
  async init() {
    const {
      availableAccounts = [],
      selectedAccounts = [],
      selectedDatabase = null as Database,
      notionApiKey,
    } = await chrome.storage.local.get(['availableAccounts', 'selectedAccounts', 'selectedDatabase', 'notionApiKey']);
    this.availableAccounts = Object.entries(availableAccounts).map(([className, title]) => ({ className, title }));
    this.selectedAccounts = selectedAccounts;
    this.selectedDatabase = selectedDatabase;
    this.notionApiKey = notionApiKey;
  },
  onCheckBoxChange() {
    this.buttonTitle = 'Save';

    const checkbox = this.$event.target;
    if (checkbox.checked && !this.selectedAccounts.includes(checkbox.value)) {
      this.selectedAccounts.push(checkbox.value);
    }
    if (!checkbox.checked && this.selectedAccounts.includes(checkbox.value)) {
      this.selectedAccounts.splice(this.selectedAccounts.indexOf(checkbox.value), 1);
    }
  },
  onSave() {
    chrome.storage.local.set({
      selectedAccounts: Alpine.raw(this.selectedAccounts),
      selectedDatabase: Alpine.raw(this.selectedDatabase),
      notionApiKey: Alpine.raw(this.notionApiKey),
    });
    this.buttonTitle = 'Saved';
  },
}));
Alpine.start();
