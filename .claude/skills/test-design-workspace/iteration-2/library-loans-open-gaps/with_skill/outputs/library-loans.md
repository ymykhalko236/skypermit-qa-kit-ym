# Library Loans — Borrowing Rules

## 1. Borrowers

A member must be at least 12 years old to borrow without a guardian.
A member may hold up to 5 books at a time.
A member whose unpaid fines exceed 5.00 EUR cannot borrow.

## 2. Loan period

The loan period is between 7 and 28 days, chosen by the member at checkout.
A loan may be renewed once, adding 14 days.

## 3. Fines

A fine of 0.25 EUR is charged for each full day a book is overdue.
Fines are capped at 10.00 EUR per book.

## 4. Loan states

A loan is always in one of these states: ACTIVE, OVERDUE, RETURNED, LOST.

- ACTIVE → RETURNED when the member returns the book.
- ACTIVE → OVERDUE when the due date passes.
- OVERDUE → RETURNED when the member returns the book.
- OVERDUE → LOST after 60 days overdue.
