/**
 * Twenty example bank alert strings.
 *
 * These are SYNTHETIC. They were written for this repository as representative
 * shapes of the alerts UAE and East African banks send — an amount, a merchant,
 * sometimes a balance, sometimes a date, sometimes neither. They are not any
 * specific bank's real template and no real account, card or reference number
 * appears in them.
 *
 * The set deliberately covers the cases the parser has to get right:
 * English with a balance, English without, Arabic-English mixed, a truncated
 * merchant, a credit, an OTP, a refund, and one where the amount is unreadable.
 */

export type SeedAlert = {
  /** Stable id so the parse fixtures can reference the same string. */
  id: string;
  text: string;
  /** What a correct parse looks like. Used by evals/fixtures/parse.json. */
  note: string;
};

export const SEED_ALERTS: readonly SeedAlert[] = [
  {
    id: "a01",
    text: "Your Card ending 4417 was used for AED 245.50 at CARREF 4471 DUBAI AE on 12/07/2026 14:32. Avl Bal AED 8,412.10",
    note: "English, balance present, date present",
  },
  {
    id: "a02",
    text: "Purchase of AED 62.00 at TALABAT.COM on 14-07-2026. Ref 88213A",
    note: "English, no balance, reference present",
  },
  {
    id: "a03",
    text: "AED 18.00 spent at CAREEM NETWORKS FZ LLC",
    note: "English, no balance, no date, caller supplies fallback date",
  },
  {
    id: "a04",
    text: "تم خصم AED 340.00 من بطاقتك في LULU HYPERMARKET SILICON OASIS بتاريخ 16/07/2026",
    note: "Arabic-English mixed, debit",
  },
  {
    id: "a05",
    text: "Card purchase AED 1,240.00 MAF CARREFOUR MALL OF THE EM",
    note: "Truncated merchant, thousands separator",
  },
  {
    id: "a06",
    text: "Salary credit of AED 18,000.00 has been credited to your account XXXX2201. Avl Bal AED 26,412.10",
    note: "CREDIT — must be skipped, is_transaction false",
  },
  {
    id: "a07",
    text: "123456 is your One Time Password. Do not share it with anyone. Valid for 5 minutes.",
    note: "OTP — must be skipped, is_transaction false",
  },
  {
    id: "a08",
    text: "Refund of AED 129.00 from NOON.COM has been processed to your card ending 4417",
    note: "REFUND — money in, must be skipped as an outgoing payment",
  },
  {
    id: "a09",
    text: "Transaction declined. Amount could not be authorised at SHARAF DG ELECTRONICS. Please contact your bank.",
    note: "Unreadable/absent amount — is_transaction true, amount null, confidence below 0.3",
  },
  {
    id: "a10",
    text: "POS PURCHASE AED 89.75 UNION COOP AL BARSHA DUBAI AE 19/07/2026 19:04",
    note: "Processor prefix, place suffix",
  },
  {
    id: "a11",
    text: "AED 55.00 debited for ADNOC DISTRIBUTION 0092 on 21/07/2026. Available balance AED 7,980.35",
    note: "Fuel, store number in merchant",
  },
  {
    id: "a12",
    text: "Your balance enquiry: Avl Bal AED 7,980.35 as of 21/07/2026 20:11",
    note: "BALANCE ENQUIRY — must be skipped",
  },
  {
    id: "a13",
    text: "ECOM AED 420.00 NOON COM FZ LLC DUBAI on 23/07/26",
    note: "Ecommerce prefix, two-digit year",
  },
  {
    id: "a14",
    text: "Payment of AED 700.00 to LANDLORD TRANSFER completed on 01/08/2026",
    note: "Rent-style transfer, outgoing",
  },
  {
    id: "a15",
    text: "AED 32.50 at KARAK HOUSE JLT. Bal: 7,545.85",
    note: "Compact format, abbreviated balance label",
  },
  {
    id: "a16",
    text: "مشتريات بقيمة AED 76.25 لدى SHAWARMA STATION في 27/07/2026",
    note: "Arabic wrapper, Latin merchant",
  },
  {
    id: "a17",
    text: "Dear Customer, AED 240.00 was charged by TELECOM POSTPAID BILL. Ref: TP-99120",
    note: "Bill payment, reference present, no date",
  },
  {
    id: "a18",
    text: "Get 20% off your next order at any partner restaurant. Reply STOP to opt out.",
    note: "PROMOTION — must be skipped",
  },
  {
    id: "a19",
    text: "AED 15.00 NOL TOP UP RTA DUBAI 29/07/2026 08:12 Avl Bal AED 7,290.60",
    note: "Transport top-up, place suffix",
  },
  {
    id: "a20",
    text: "Card 4417 AED 1,499.00 SHARAF DG DUBAI FESTIVAL CITY 30/07/2026 Ref 5512QQ",
    note: "Large discretionary purchase, reference present",
  },
];
