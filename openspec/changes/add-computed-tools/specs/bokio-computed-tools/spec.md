## Purpose
Defines the read-only tools that compute deterministic figures — balances, ledgers, period sums, duplicate and bank matching, open items, profit and loss — from the company's own bookkeeping export, so that an MCP client never has to do the arithmetic itself.

## ADDED Requirements

### Requirement: Computed tools are read-only and derive from the bookkeeping export
The system SHALL expose every computed tool as read-only, SHALL obtain its data by downloading the bookkeeping export of each fiscal year the request touches (listing fiscal years first only when no fiscal year id is given), and SHALL never call a mutating endpoint.

#### Scenario: Computed tools are listed as read-only
- **GIVEN** the server starts with writes not enabled
- **WHEN** a client lists tools
- **THEN** all seven computed tools are present and each declares it is read-only

#### Scenario: One export request per fiscal year
- **GIVEN** a date range that lies inside one fiscal year and no fiscal year id
- **WHEN** a computed tool runs
- **THEN** exactly one fiscal-year listing request and one export download are made

#### Scenario: Export fetched by fiscal year id without a listing
- **GIVEN** a fiscal year id is passed
- **WHEN** a computed tool runs
- **THEN** only the export download for that id is requested

### Requirement: Money arithmetic is exact
The system SHALL perform all sums in whole öre and SHALL return every amount with at most two decimals and no floating-point drift.

#### Scenario: Sum of many öre amounts is exact
- **GIVEN** an export whose lines on one account are 0.10, 0.10, 0.10 and 0.70
- **WHEN** the balance of that account is computed
- **THEN** it is exactly 1.00

### Requirement: Export parsing
The system SHALL parse the export's fiscal-year ranges, account names, the opening and closing balances of year index 0 (the exported fiscal year), verifications and their lines; SHALL date every line on its verification's date; SHALL decode text as PC8 (CP437) when the export declares PC8, as UTF-8 when it starts with a byte-order mark, and as Latin-1 otherwise; and SHALL reject an export that lacks the fiscal-year range marker with an error naming it.

#### Scenario: PC8 text decoded
- **GIVEN** an export declaring PC8 whose account name contains Swedish letters encoded as CP437 bytes
- **WHEN** it is parsed
- **THEN** the account name shows the Swedish letters correctly

#### Scenario: Lines take the verification date
- **GIVEN** a verification dated on one day whose lines carry no date of their own
- **WHEN** the export is parsed
- **THEN** every line is dated on the verification's day

#### Scenario: Only year index 0 balances are used
- **GIVEN** an export with ranges and opening balances for year index 0 and year index -1
- **WHEN** balances are requested
- **THEN** the opening balance of year index 0 is used and the fiscal year's range is that of index 0

#### Scenario: Malformed export is rejected
- **GIVEN** a body with no fiscal-year range marker
- **WHEN** it is parsed
- **THEN** the tool returns an error naming the missing marker and no figures

### Requirement: Annulled verifications are cancelled
The system SHALL treat a verification whose text starts with the annulment marker naming another verification, and whose lines exactly negate that verification's lines, as an annulment: both are excluded from duplicate, reconciliation and open-item matching, remain in the ledger flagged as cancelled, and net to zero in every balance.

#### Scenario: Annulment pair nets to zero in balances and is flagged in the ledger
- **GIVEN** a verification and a later annulment verification naming it with negated lines
- **WHEN** balances and the ledger are requested
- **THEN** the balance is unchanged by the pair and both ledger lines are flagged as cancelled

#### Scenario: Annulled pairs are excluded from duplicate and reconciliation matching
- **GIVEN** an annulled verification, its annulment, and a live verification of the same amount on the same account within the window
- **WHEN** duplicates and reconciliation are requested
- **THEN** no duplicate group is returned and the bank row matches only the live line

#### Scenario: Annulled postings are not open items
- **GIVEN** a posting and its annulment on the open-items account
- **WHEN** open items are requested
- **THEN** neither appears as an open item or an unmatched payment

### Requirement: Account balances at a date
The system SHALL return, per account and sorted by account number, the opening balance, the movement up to and including the date, and the resulting balance; result accounts (classes 3–8) open at zero; the date defaults to the fiscal year's last day when a fiscal year id is given and to today otherwise; an optional account list restricts the output.

#### Scenario: Balance at a mid-year date equals opening plus movements to date
- **GIVEN** an account with an opening balance and lines before and after a date
- **WHEN** balances are requested at that date
- **THEN** the balance is the opening plus only the lines dated on or before the date, and the movement field equals that sum

#### Scenario: Balance at fiscal year end equals the closing balance in the export
- **GIVEN** an export with a closing balance for a balance account
- **WHEN** balances are requested at the fiscal year's last day
- **THEN** the computed balance equals the export's closing balance

#### Scenario: Date outside every fiscal year is rejected
- **GIVEN** a date that no fiscal year covers
- **WHEN** balances are requested
- **THEN** the tool returns an error naming the covered ranges and no export is downloaded

#### Scenario: Accounts filter limits output and keeps order
- **GIVEN** an account list in arbitrary order
- **WHEN** balances are requested
- **THEN** only those accounts are returned, sorted by account number

### Requirement: Account ledger with running balance
The system SHALL return the lines of one account between two dates with verification series, number, date, text, amount and running balance, ordered by date, then series, then verification number, then line order; the opening balance is the balance before the first day; a range spanning several fiscal years is continuous; a start date after the end date is rejected.

#### Scenario: Ledger lines carry running balance in deterministic order
- **GIVEN** two lines on the same account and the same date in different verifications
- **WHEN** the ledger is requested
- **THEN** they appear ordered by series and verification number and each running balance equals the previous one plus the line amount

#### Scenario: Range spanning two fiscal years downloads both
- **GIVEN** a range that starts in one fiscal year and ends in the next
- **WHEN** the ledger is requested
- **THEN** both exports are downloaded and the lines run continuously across the boundary

#### Scenario: From after to is rejected
- **GIVEN** a start date later than the end date
- **WHEN** the ledger is requested
- **THEN** the tool returns an error and no export is downloaded

### Requirement: Bank reconciliation by exact amount within a day tolerance
The system SHALL match caller-supplied bank rows (date, amount, text) against ledger lines on one account by exact amount within a day tolerance, each ledger line at most once, and SHALL report matched pairs, unmatched rows on each side, suspected duplicate ledger lines, both totals and the net difference.

#### Scenario: Exact amount within tolerance is matched to the closest date
- **GIVEN** one bank row and two ledger lines of the same amount, one two days away and one five days away, with a tolerance of seven
- **WHEN** reconciliation runs
- **THEN** the row matches the line two days away and the other line is unmatched

#### Scenario: Tie on date distance resolves to the earliest ledger line
- **GIVEN** one bank row and two ledger lines of the same amount, one the day before and one the day after
- **WHEN** reconciliation runs
- **THEN** the row matches the earlier line

#### Scenario: A ledger line is matched at most once
- **GIVEN** two identical bank rows and one ledger line of that amount
- **WHEN** reconciliation runs
- **THEN** one row is matched and the other is reported as unmatched

#### Scenario: Unmatched rows on both sides and net difference are reported
- **GIVEN** bank rows and ledger lines whose totals differ
- **WHEN** reconciliation runs
- **THEN** the unmatched bank rows, the unmatched ledger lines, both totals and the difference (ledger minus bank) are returned

#### Scenario: Suspected duplicate ledger lines are flagged
- **GIVEN** a matched ledger line and an unmatched ledger line of the same amount within the tolerance
- **WHEN** reconciliation runs
- **THEN** the unmatched line is listed under suspected duplicates

#### Scenario: Empty bank rows are rejected
- **GIVEN** no bank rows
- **WHEN** reconciliation is requested
- **THEN** the tool returns an error and no export is downloaded

### Requirement: Duplicate detection
The system SHALL group lines with the same account and amount whose dates fall within a day window into one group when they belong to different verifications, SHALL ignore zero amounts and lines of the same verification, SHALL restrict to one account when asked, and SHALL return groups sorted by account, amount and first date.

#### Scenario: Same amount on the same account within the window is grouped
- **GIVEN** two verifications booking the same amount on the same account three days apart and a window of seven
- **WHEN** duplicates are requested
- **THEN** one group with both lines is returned

#### Scenario: Lines of one verification are not duplicates of each other
- **GIVEN** a verification with two lines of the same amount on the same account
- **WHEN** duplicates are requested
- **THEN** no group is returned

#### Scenario: Equal amounts outside the window are not grouped
- **GIVEN** two verifications booking the same amount thirty days apart and a window of seven
- **WHEN** duplicates are requested
- **THEN** no group is returned

### Requirement: VAT account summary without return-box mapping
The system SHALL sum, per account over a period, every account in the VAT range (2610–2659) and the sales range (3000–3999) with ledger sign (debit positive, credit negative), and SHALL return output VAT (negated sum of 2610–2639), input VAT (sum of 2640–2649) and their net; it SHALL NOT map amounts to tax-return boxes.

#### Scenario: VAT and sales accounts are summed per account for the period
- **GIVEN** lines on output VAT, input VAT and sales accounts inside and outside a period
- **WHEN** the summary is requested
- **THEN** each account inside the period is listed once with its sum in ledger sign, and lines outside the period are excluded

#### Scenario: Totals derive from account ranges
- **GIVEN** a credit on an output VAT account and a debit on an input VAT account
- **WHEN** the summary is requested
- **THEN** output VAT is the negated credit, input VAT is the debit, and net VAT is output minus input

### Requirement: Open items by exact-amount matching
The system SHALL, for one account up to an as-of date, pair each payment (opposite-sign line) with the earliest unpaired same-amount posting dated on or before it, SHALL report unpaired postings with their age in days at the as-of date, unpaired payments separately, the account balance, and the opening balance of the oldest loaded fiscal year as an unitemised amount; lines after the as-of date are ignored.

#### Scenario: Payment settles the earliest open item of equal amount
- **GIVEN** two postings of the same amount on different dates and one payment of that amount
- **WHEN** open items are requested
- **THEN** the later posting is open and the earlier one is settled

#### Scenario: Unsettled items report age at the as-of date
- **GIVEN** a posting without a payment
- **WHEN** open items are requested at a later as-of date
- **THEN** the item is listed with age equal to the days between its date and the as-of date

#### Scenario: Unmatched payments are reported separately
- **GIVEN** a payment with no posting of equal amount
- **WHEN** open items are requested
- **THEN** it appears under unmatched payments, not under open items

#### Scenario: Items from before the loaded years are an unitemised opening amount
- **GIVEN** the oldest loaded fiscal year has a non-zero opening balance on the account
- **WHEN** open items are requested
- **THEN** that opening balance is returned as the unitemised amount and the balance equals it plus the loaded lines

#### Scenario: Lines after the as-of date are ignored
- **GIVEN** a posting dated after the as-of date
- **WHEN** open items are requested
- **THEN** it is absent from open items and from the balance

### Requirement: Profit and loss per class or account
The system SHALL sum result accounts (classes 3–8) over a period, grouped by BAS class or by account, with amounts in ledger sign, SHALL return the period result as the negated total (profit positive), and SHALL exclude balance accounts.

#### Scenario: Result per class covers classes 3 to 8
- **GIVEN** lines on revenue and cost accounts in the period
- **WHEN** profit and loss is requested grouped by class
- **THEN** one row per class present is returned in class order and the result equals the negated sum of all rows

#### Scenario: Grouping by account lists each account once
- **GIVEN** several lines on one result account
- **WHEN** profit and loss is requested grouped by account
- **THEN** that account appears once with the summed amount, rows sorted by account number

#### Scenario: Balance accounts are excluded
- **GIVEN** lines on a bank account and a revenue account in the period
- **WHEN** profit and loss is requested
- **THEN** only the revenue account contributes
