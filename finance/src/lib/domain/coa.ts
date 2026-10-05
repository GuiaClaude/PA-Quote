/**
 * Default chart of accounts for a PH printing business (editable in the app).
 * Codes in SYS are used by automatic posting: they can be renamed, not deleted.
 */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense" | "other_income" | "other_expense";
export type PurchaseClass = "goods" | "services" | "capital_goods";

export interface AccountDef {
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  taxTag?: string;
  /** Column in the BIR purchases summary (your INPUT sheet). */
  birColumn?: string;
  purchaseClass?: PurchaseClass;
  system?: boolean;
}

export const SYS = {
  cashOnHand: "1010",
  pettyCash: "1020",
  bpiCurrent: "1030",
  bpiSavings: "1031",
  gcash: "1040",
  spenmo: "1045",
  undeposited: "1050",
  ar: "1100",
  advancesToEmployees: "1150",
  inputVat: "1300",
  cwt: "1310",
  openingBalanceEquity: "3900",
  ap: "2010",
  outputVat: "2100",
  deferredOutputVat: "2105",
  vatPayable: "2110",
  ewtPayable: "2210",
  dueToEmployees: "2420",
  customerDeposits: "2500",
  dueToStockholder: "2800",
  creditCardPayable: "2050",
  retainedEarnings: "3100",
  revenueDefault: "4010",
} as const;

export const DEFAULT_ACCOUNTS: AccountDef[] = [
  // Assets
  { code: "1010", name: "Cash on Hand", type: "asset", subtype: "cash", system: true },
  { code: "1020", name: "Petty Cash Fund", type: "asset", subtype: "cash", system: true },
  { code: "1030", name: "Cash in Bank – BPI Current", type: "asset", subtype: "cash", system: true },
  { code: "1031", name: "Cash in Bank – BPI Savings", type: "asset", subtype: "cash", system: true },
  { code: "1040", name: "GCash", type: "asset", subtype: "cash", system: true },
  { code: "1045", name: "Spenmo Wallet", type: "asset", subtype: "cash", system: true },
  { code: "1050", name: "Undeposited Collections (cheques on hand)", type: "asset", subtype: "cash", system: true },
  { code: "1100", name: "Accounts Receivable – Trade", type: "asset", subtype: "receivable", system: true },
  { code: "1110", name: "Allowance for Doubtful Accounts", type: "asset", subtype: "receivable" },
  { code: "1150", name: "Advances to Employees", type: "asset", subtype: "receivable", system: true },
  { code: "1160", name: "Advances to Suppliers", type: "asset", subtype: "receivable" },
  { code: "1200", name: "Printing Supplies Inventory", type: "asset", subtype: "inventory" },
  { code: "1300", name: "Input VAT", type: "asset", subtype: "tax", taxTag: "input_vat", system: true },
  { code: "1310", name: "Creditable Withholding Tax (2307)", type: "asset", subtype: "tax", taxTag: "cwt", system: true },
  { code: "1320", name: "Prepaid Income Tax / Excess Tax Credits", type: "asset", subtype: "tax" },
  { code: "1400", name: "Prepaid Expenses", type: "asset", subtype: "prepaid" },
  { code: "1500", name: "Printing Machinery & Equipment", type: "asset", subtype: "fixed_asset", birColumn: "Office Equip.", purchaseClass: "capital_goods" },
  { code: "1510", name: "Office Equipment", type: "asset", subtype: "fixed_asset", birColumn: "Office Equip.", purchaseClass: "capital_goods" },
  { code: "1520", name: "Furniture & Fixtures", type: "asset", subtype: "fixed_asset", birColumn: "Furniture and Fixtures", purchaseClass: "capital_goods" },
  { code: "1530", name: "Transportation Equipment", type: "asset", subtype: "fixed_asset", birColumn: "Transpo. Equip.", purchaseClass: "capital_goods" },
  { code: "1540", name: "Leasehold Improvements", type: "asset", subtype: "fixed_asset", birColumn: "Office Improvements", purchaseClass: "capital_goods" },
  { code: "1590", name: "Accumulated Depreciation", type: "asset", subtype: "contra_asset" },
  { code: "1600", name: "Security & Rental Deposits", type: "asset", subtype: "other" },
  // Liabilities
  { code: "2010", name: "Accounts Payable – Trade", type: "liability", subtype: "payable", system: true },
  { code: "2020", name: "Accrued Expenses", type: "liability", subtype: "payable" },
  { code: "2050", name: "Credit Card Payable", type: "liability", subtype: "payable", system: true },
  { code: "2100", name: "Output VAT", type: "liability", subtype: "tax", taxTag: "output_vat", system: true },
  { code: "2105", name: "Deferred Output VAT (uncollected)", type: "liability", subtype: "tax", taxTag: "deferred_output_vat", system: true },
  { code: "2110", name: "VAT Payable", type: "liability", subtype: "tax", taxTag: "vat_payable", system: true },
  { code: "2200", name: "Withholding Tax Payable – Compensation", type: "liability", subtype: "tax", system: true },
  { code: "2210", name: "Withholding Tax Payable – Expanded", type: "liability", subtype: "tax", taxTag: "ewt", system: true },
  { code: "2300", name: "SSS Payable", type: "liability", subtype: "payroll" },
  { code: "2310", name: "PhilHealth Payable", type: "liability", subtype: "payroll" },
  { code: "2320", name: "Pag-IBIG Payable", type: "liability", subtype: "payroll" },
  { code: "2330", name: "SSS & HDMF Loans Payable", type: "liability", subtype: "payroll" },
  { code: "2400", name: "Salaries Payable", type: "liability", subtype: "payroll" },
  { code: "2420", name: "Due to Employees (reimbursements)", type: "liability", subtype: "payable", system: true },
  { code: "2500", name: "Customer Deposits & Down Payments", type: "liability", subtype: "deposit", system: true },
  { code: "2600", name: "Income Tax Payable", type: "liability", subtype: "tax" },
  { code: "2700", name: "Loans Payable", type: "liability", subtype: "loan" },
  { code: "2800", name: "Due to Stockholder", type: "liability", subtype: "related_party", system: true },
  // Equity
  { code: "3010", name: "Share Capital", type: "equity" },
  { code: "3100", name: "Retained Earnings", type: "equity", system: true },
  { code: "3300", name: "Dividends", type: "equity" },
  { code: "3900", name: "Opening Balance Equity", type: "equity", system: true },
  // Revenue
  { code: "4010", name: "Printing Revenue – Offset", type: "revenue", system: true },
  { code: "4020", name: "Printing Revenue – Digital", type: "revenue" },
  { code: "4030", name: "Printing Revenue – Large Format", type: "revenue" },
  { code: "4040", name: "Design & Pre-press Fees", type: "revenue" },
  { code: "4090", name: "Other Services Revenue", type: "revenue" },
  { code: "4100", name: "Sales Returns & Discounts", type: "revenue", subtype: "contra_revenue" },
  { code: "4900", name: "Other Income", type: "other_income" },
  // Cost of sales (Direct Materials)
  { code: "5010", name: "Paper", type: "cogs", birColumn: "Printing Supplies", purchaseClass: "goods" },
  { code: "5015", name: "CTP / Plates / Negatives", type: "cogs", birColumn: "Printing Supplies", purchaseClass: "goods" },
  { code: "5020", name: "Job-Out (outsourced printing)", type: "cogs", birColumn: "Misc (services)", purchaseClass: "services" },
  { code: "5030", name: "Finishing", type: "cogs", birColumn: "Misc (services)", purchaseClass: "services" },
  { code: "5035", name: "Postpress", type: "cogs", birColumn: "Misc (services)", purchaseClass: "services" },
  { code: "5040", name: "Bindery", type: "cogs", birColumn: "Misc (services)", purchaseClass: "services" },
  { code: "5045", name: "Supplies – Press", type: "cogs", birColumn: "Printing Supplies", purchaseClass: "goods" },
  { code: "5046", name: "Supplies – Postpress/Bindery/Finish", type: "cogs", birColumn: "Printing Supplies", purchaseClass: "goods" },
  { code: "5050", name: "Direct Labor", type: "cogs" },
  { code: "5060", name: "Delivery on Jobs", type: "cogs", birColumn: "Courier", purchaseClass: "services" },
  // Operating expenses
  { code: "6010", name: "Salaries & Wages", type: "expense" },
  { code: "6020", name: "SSS/PhilHealth/Pag-IBIG – Employer", type: "expense" },
  { code: "6030", name: "13th Month & Bonuses", type: "expense" },
  { code: "6040", name: "Allowances & De Minimis", type: "expense" },
  { code: "6050", name: "Management Expenses", type: "expense", birColumn: "Misc (services)", purchaseClass: "services" },
  { code: "6100", name: "Office Supplies", type: "expense", birColumn: "Office Supplies", purchaseClass: "goods" },
  { code: "6105", name: "Supplies – Cleaning", type: "expense", birColumn: "Misc Goods", purchaseClass: "goods" },
  { code: "6110", name: "Meals", type: "expense", birColumn: "Meals", purchaseClass: "goods" },
  { code: "6120", name: "Representation", type: "expense", birColumn: "Representation", purchaseClass: "goods" },
  { code: "6130", name: "Fuel & Oil", type: "expense", birColumn: "Fuel", purchaseClass: "goods" },
  { code: "6140", name: "Repairs – Main Machine", type: "expense", birColumn: "RM Services", purchaseClass: "services" },
  { code: "6141", name: "Repairs – Office/Press Area", type: "expense", birColumn: "Repair and Maintenance", purchaseClass: "goods" },
  { code: "6142", name: "Repairs – Vehicle", type: "expense", birColumn: "RM Services", purchaseClass: "services" },
  { code: "6150", name: "Transportation & Travel", type: "expense", birColumn: "Transportation Fee", purchaseClass: "services" },
  { code: "6155", name: "Fare / Terminal / Parking / Toll", type: "expense", birColumn: "Fare/Terminal Fee Parking / Toll", purchaseClass: "services" },
  { code: "6160", name: "Light & Power (Electricity)", type: "expense", birColumn: "Elec Water", purchaseClass: "services" },
  { code: "6165", name: "Water", type: "expense", birColumn: "Elec Water", purchaseClass: "services" },
  { code: "6170", name: "Communication & Internet", type: "expense", birColumn: "Telephone", purchaseClass: "services" },
  { code: "6175", name: "Courier & Freight", type: "expense", birColumn: "Courier", purchaseClass: "services" },
  { code: "6180", name: "Rent", type: "expense", birColumn: "Rental", purchaseClass: "services" },
  { code: "6185", name: "Hotel & Accommodation", type: "expense", birColumn: "Hotel Accommodation", purchaseClass: "services" },
  { code: "6190", name: "Professional Fees & Commissions", type: "expense", birColumn: "Professional Fees", purchaseClass: "services" },
  { code: "6200", name: "Security Services", type: "expense", birColumn: "Security Guards", purchaseClass: "services" },
  { code: "6220", name: "Taxes & Licenses", type: "expense" },
  { code: "6230", name: "Insurance", type: "expense", birColumn: "Insurance", purchaseClass: "services" },
  { code: "6240", name: "Depreciation", type: "expense" },
  { code: "6250", name: "Bank & Spenmo Charges", type: "expense" },
  { code: "6260", name: "Bad Debts", type: "expense" },
  { code: "6290", name: "Miscellaneous Expense", type: "expense", birColumn: "Misc Goods", purchaseClass: "goods" },
  // Other / tax
  { code: "7010", name: "Interest Expense", type: "other_expense" },
  { code: "7090", name: "Income Tax Expense", type: "other_expense" },
];

/** Your AP workbook's 34 expense categories → default account + expense type. */
export const DEFAULT_EXPENSE_CATEGORIES: { name: string; account: string; expenseType: "direct_materials" | "overhead_fixed" | "overhead_non_fixed" }[] = [
  { name: "Paper", account: "5010", expenseType: "direct_materials" },
  { name: "CTP/Negatives", account: "5015", expenseType: "direct_materials" },
  { name: "Finish", account: "5030", expenseType: "direct_materials" },
  { name: "Postpress", account: "5035", expenseType: "direct_materials" },
  { name: "Bindery", account: "5040", expenseType: "direct_materials" },
  { name: "Job-Out", account: "5020", expenseType: "direct_materials" },
  { name: "Supplies - Postpress/Bindery/Finish", account: "5046", expenseType: "direct_materials" },
  { name: "Supplies - Press", account: "5045", expenseType: "direct_materials" },
  { name: "Supplies - Office", account: "6100", expenseType: "overhead_non_fixed" },
  { name: "Supplies - Cleaning", account: "6105", expenseType: "overhead_non_fixed" },
  { name: "Salaries & Wages", account: "6010", expenseType: "overhead_fixed" },
  { name: "Management Expenses", account: "6050", expenseType: "overhead_fixed" },
  { name: "Taxes", account: "6220", expenseType: "overhead_fixed" },
  { name: "Licenses", account: "6220", expenseType: "overhead_fixed" },
  { name: "SSS - Contribution", account: "6020", expenseType: "overhead_fixed" },
  { name: "SSS - Loan", account: "2330", expenseType: "overhead_fixed" },
  { name: "HDMF - Contribution", account: "6020", expenseType: "overhead_fixed" },
  { name: "HDMF - Loan", account: "2330", expenseType: "overhead_fixed" },
  { name: "PHIC", account: "6020", expenseType: "overhead_fixed" },
  { name: "Rental", account: "6180", expenseType: "overhead_fixed" },
  { name: "Professional Fees/Commissions", account: "6190", expenseType: "overhead_non_fixed" },
  { name: "Electricity", account: "6160", expenseType: "overhead_fixed" },
  { name: "Tel./Comm.", account: "6170", expenseType: "overhead_fixed" },
  { name: "Insurance", account: "6230", expenseType: "overhead_fixed" },
  { name: "Water - Drinking", account: "6165", expenseType: "overhead_non_fixed" },
  { name: "Water - Service", account: "6165", expenseType: "overhead_fixed" },
  { name: "Transpo", account: "6150", expenseType: "overhead_non_fixed" },
  { name: "Representations", account: "6120", expenseType: "overhead_non_fixed" },
  { name: "Repairs - Main Machine", account: "6140", expenseType: "overhead_non_fixed" },
  { name: "Repairs - Main Office/Press Area", account: "6141", expenseType: "overhead_non_fixed" },
  { name: "Repairs - Main Vehicle", account: "6142", expenseType: "overhead_non_fixed" },
  { name: "Loans & Amortizations (Interest)", account: "7010", expenseType: "overhead_fixed" },
  { name: "Miscellaneous", account: "6290", expenseType: "overhead_non_fixed" },
  { name: "Meals", account: "6110", expenseType: "overhead_non_fixed" },
];

export function normalSide(type: AccountType): "debit" | "credit" {
  return type === "asset" || type === "cogs" || type === "expense" || type === "other_expense" ? "debit" : "credit";
}
