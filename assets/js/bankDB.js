/* ============================================================
   bankDB.js — mock banking data (prototype only, no real money)
   Includes the beneficiaries seed that was missing before.
   ============================================================ */

const BankDB = {
  profile: {
    fullName:"Yashas R.",
    customerId:"BG-4471-2290",
    email:"yashas@securebank.example",
    phone:"+91 90000 00000",
    address:"Belagavi, Karnataka, IN"
  },

  security: {
    twoFA:true,
    lastLogin:"Today, 09:14",
    trustedDevice:"This device",
    lastPasswordChange:"42 days ago",
    behavioralAuth:true
  },

  accounts: [
    { id:"ac1", type:"Savings Account",  number:"XXXX XXXX 4471", balance:842310, status:"Active" },
    { id:"ac2", type:"Current Account",  number:"XXXX XXXX 9920", balance:218430, status:"Active" },
    { id:"ac3", type:"Salary Account",   number:"XXXX XXXX 1185", balance:56101,  status:"Active" }
  ],

  // Previously referenced by getBeneficiaries() but never defined -> fixed.
  beneficiaries: [
    { name:"Anita Kulkarni", bank:"HDFC Bank",  account:"XXXX 3321", verified:true },
    { name:"Rohit Desai",    bank:"ICICI Bank", account:"XXXX 7782", verified:true },
    { name:"Sneha Patil",    bank:"Axis Bank",  account:"XXXX 1043", verified:false },
    { name:"Vikram Joshi",   bank:"SBI",        account:"XXXX 6650", verified:true }
  ],

  transactions: [
    { date:"28 Jun", time:"09:02", name:"Amazon India",     category:"Shopping",  type:"Debit",  amount:2499,  status:"Completed" },
    { date:"27 Jun", time:"18:44", name:"Salary Credit",    category:"Income",    type:"Credit", amount:86000, status:"Completed" },
    { date:"27 Jun", time:"11:20", name:"Swiggy",           category:"Food",      type:"Debit",  amount:560,   status:"Completed" },
    { date:"26 Jun", time:"20:10", name:"Electricity Bill", category:"Utilities", type:"Debit",  amount:1840,  status:"Completed" },
    { date:"25 Jun", time:"14:05", name:"Rohit Desai",      category:"Transfer",  type:"Debit",  amount:15000, status:"Completed" },
    { date:"24 Jun", time:"08:30", name:"Mutual Fund SIP",  category:"Investment",type:"Debit",  amount:10000, status:"Completed" }
  ],

  cards: [
    { id:"cd1", type:"Debit Card",  network:"RuPay", last4:"4471", expiry:"08/29", status:"Active" },
    { id:"cd2", type:"Credit Card", network:"Visa",  last4:"9920", expiry:"03/28", status:"Active", limit:300000, used:42100 }
  ],

  loans: [
    { id:"ln1", type:"Personal Loan",     principal:300000, outstanding:184200, emi:9800, nextDue:"05 Jul", status:"Active" },
    { id:"ln2", type:"Two-Wheeler Loan",  principal:85000,  outstanding:0,      emi:0,    nextDue:"\u2014",   status:"Closed" }
  ],

  investments: [
    { name:"Nifty Index Fund", type:"Mutual Fund",   invested:120000, current:138400 },
    { name:"BankGuard FD",     type:"Fixed Deposit",  invested:200000, current:214300 },
    { name:"Tech Growth ETF",  type:"ETF",             invested:60000,  current:55800 }
  ],

  statements: [
    { period:"May 2026", account:"Savings XXXX4471", generated:"01 Jun 2026" },
    { period:"Apr 2026", account:"Savings XXXX4471", generated:"01 May 2026" },
    { period:"Mar 2026", account:"Savings XXXX4471", generated:"01 Apr 2026" }
  ],

  transferPolicy: {
    verificationLimit:50000,   // step-up above this when trust is 60-79
    dailyLimit:200000
  }
};

// Accessor helpers (kept so existing call sites still work)
const getAccounts      = () => BankDB.accounts;
const getBeneficiaries = () => BankDB.beneficiaries;
const getTransactions  = () => BankDB.transactions;
const getCards         = () => BankDB.cards;
const getLoans         = () => BankDB.loans;
const getInvestments   = () => BankDB.investments;
const getStatements    = () => BankDB.statements;
