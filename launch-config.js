// Red Road Jiu Jitsu — launch identity defaults
// These values improve setup/user experience only. Firestore Security Rules are the actual authority.
export const PRIMARY_OWNER = {
  name: 'Jeff Davis',
  email: 'redroadjiujitsu@protonmail.com'
};

// Replace this with William's exact login email before launch.
// The matching Firestore document must be created manually at developers/{lowercase-email}.
export const DEVELOPER = {
  name: 'William Inselman',
  email: 'REPLACE_WITH_DEVELOPER_EMAIL'
};
