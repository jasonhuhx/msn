declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

type Account = {
  name: string;
  balance: string;
};
type DatabasePropertyTypes = 'title' | 'date' | 'number';
type DatabaseProperty = {
  type: DatabasePropertyTypes;
  name: string;
};
type Database = {
  id: string;
  title: string;
  icon: string | null;
  emoji: string | null;
  properties: DatabaseProperty[];
};
