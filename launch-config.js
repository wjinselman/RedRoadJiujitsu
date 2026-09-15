// Red Road Jiu Jitsu — launch identity defaults
// Convenience/UI defaults only. Firestore Security Rules are the authority.
export const PRIMARY_OWNER = {
  name: 'Jeff Davis',
  email: 'redroadjiujitsu@protonmail.com'
};

export const DEVELOPER = {
  name: 'William Inselman',
  email: 'wjinselman@gmail.com'
};

// Release controls let us retire an experience without deleting its code.
export const FEATURES = Object.freeze({
  memberPhoneCheckIn: true,
  kioskAttendance: false
});
