// Logical accounts (employees) mapped to Electron session partitions
const ACCOUNTS = [
  { id: 1, name: "Employee 1", partition: "persist:account-1" },
  { id: 2, name: "Employee 2", partition: "persist:account-2" },
  { id: 3, name: "Employee 3", partition: "persist:account-3" },
  { id: 4, name: "Employee 4", partition: "persist:account-4" },
  { id: 5, name: "Employee 5", partition: "persist:account-5" }
];

// Target site
const TARGET_URL = "https://claude.ai";

module.exports = {
  ACCOUNTS,
  TARGET_URL
};
