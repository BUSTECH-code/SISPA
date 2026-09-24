# SISPA — Smart Stock & Buying Assistant

> **"Tell me what I need to buy before I run out."**  
> Simple, practical stock intelligence and buying assistant built specifically for building-material distributors and wholesalers.

---

## 1. What is SISPA?

SISPA is a commercial, multi-tenant software system designed specifically for building-material distributors, wholesalers, and retail depots selling cement, steel rebar, PVC pipes, roofing sheets, emulsion paints, sanitary ware, electrical cable, and hardware.

Unlike heavy enterprise accounting suites or generic ERP systems with hundreds of complex menus, SISPA is designed around **two fundamental product principles**:

1. **"SHOW USERS WHAT THEY NEED FIRST. MAKE EVERYTHING ELSE DISCOVERABLE WHEN THEY NEED IT."**
2. **"DO NOT MAKE THE USER NAVIGATE THE SYSTEM'S ARCHITECTURE. ORGANIZE THE PRODUCT AROUND THE USER'S JOB."**

SISPA acts like an experienced, vigilant shop manager sitting beside the owner — continuously monitoring yard stock, watching how fast goods are selling, tracking contractor credit, and telling you exactly what to buy before you lose sales.

---

## 2. Architectural Separation: Identity, Environment & Authority

SISPA strictly decouples four distinct concepts that are often conflated in naive systems:

```
+-----------------------------------------------------------------------------------+
| 1. AUTHENTICATED IDENTITY (Who is logged in?)                                     |
|    - Alhaji Ibrahim (Owner) | Musa Aminu (Staff) | SaaS Operations Admin (Platform)|
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 2. OPERATING ENVIRONMENT (Where are they operating?)                              |
|    +--------------------------------------+------------------------------------+  |
|    |      SISPA PLATFORM ENVIRONMENT      |       BUSINESS SHOP ENVIRONMENT    |  |
|    |  (SaaS Fleet, Subscriptions, Health) |  (Yard Inventory, Sales, Credit)   |  |
|    +--------------------------------------+------------------------------------+  |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. AUTHORITY & DELEGATION (What actions are permitted?)                           |
|    - Platform Admin: SaaS fleet metrics, subscription upgrades, support grants.   |
|    - Business Owner: Commercial pricing, margins, staff delegation, cash drawer. |
|    - Business Staff: Delegated operational counter desk (sell, receive, count).   |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 4. INFORMATION ACCESS & PROGRESSIVE VISIBILITY (What is shown immediately?)       |
|    - Layer 1 (Immediate): Today's Sales, Cash Collected, Customers Owing.         |
|    - Layer 2 (Action): Sell, Receive, Collect, Restock (Buy).                     |
|    - Layer 3 (Context): Urgent stockout warnings only (Healthy stock tucked away).|
|    - Layer 4 (Detail): Searchable Stock List, Customer Debt Book, Buying Planner. |
|    - Layer 5 (Governance): "More" Hub -> Staff, Expenses, Suppliers, WhatsApp.    |
+-----------------------------------------------------------------------------------+
```

### Why WhatsApp is Excluded from Platform Admin
WhatsApp is an operational business interface that interacts with a specific business's catalog, debtors, and orders. Platform Admins manage the multi-tenant SaaS fleet and have **Zero Casual Access** to tenant records. Exposing WhatsApp in the platform shell would breach tenant commercial privacy. Both the backend `/api/whatsapp` endpoint and the frontend UI enforce strict tenant-boundary checks.

---

## 3. Quick Demo & Evaluation (Instant Persona Switcher)

To allow instant evaluation across all operating environments, SISPA includes an **Instant Role Switcher** in the top navigation bar and authentication modal:

| Persona | Name | Operating Environment | Access & Boundary |
| :--- | :--- | :--- | :--- |
| 🏢 **Shop Owner** | Alhaji Ibrahim Musa | **Business Environment** | Full commercial control: purchase costs, profit estimates, margins, debt, staff delegation, cash drawer check. |
| 👷 **Staff Operator** | Musa Aminu | **Business Environment** | Delegated counter desk: sell goods, receive truck deliveries, collect debt, physical counts. **All purchase costs & margins redacted server-side**. |
| 🛡️ **Platform Admin** | SaaS Operations Admin | **Platform Environment** | Multi-tenant SaaS fleet management, subscriptions, platform audit. **Zero Casual Access** to tenant records. |

*Credentials for manual login: Password is `password123` for all seeded demo accounts.*

---

## 4. The Redesigned Business Owner Experience

The business owner is the primary target user. Rather than presenting a wall of charts or database tables, the Owner experience is structured around the owner's natural mental model:
1. **What happened today?**
2. **What needs my attention right now?**
3. **What do I need to do?**
4. **How is the business performing?**

### The 5 Progressive Visibility Layers

#### Layer 1 — Immediate (Today's Financial Pulse)
The top of the Owner Home screen displays the three numbers that define today's reality:
- **Sales Today (₦)**: Total goods sold across all cash and credit orders.
- **Cash Collected Today (₦)**: Real physical naira and verified bank transfers received into the till.
- **Customers Owing (₦)**: Total outstanding debt across all builders and contractors.

#### Layer 2 — Action (Operational Launchers & Attention Triggers)
Four large, thumb-friendly primary action buttons:
- **Sell Goods** (`openRecordSale`) — Fast 2-tap sale recording.
- **Receive Delivery** (`openRecordDelivery`) — Offload arriving supplier trucks.
- **Collect Money** (`openRecordPayment`) — Record debt recovery payments.
- **Restock (Buy)** (`setActiveTab("BUYING")`) — Review buying list and replenishment orders.

Accompanied by direct-verb attention cards:
- *7 products need buying* $\rightarrow$ **Buy**
- *₦320k pending collection* $\rightarrow$ **Collect**
- *12 products ready for weekly count* $\rightarrow$ **Count**

#### Layer 3 — Context (What Will Finish First)
The stock urgency section displays **only items that require reordering**:
- 🔴 **Running Low (Buy Now)**: Products with less days of stock than supplier lead time + safety buffer.
- 🟡 **Check Soon (Buy Soon)**: Products approaching their reorder threshold within 7 days.
- 🟢 **Healthy Products**: Collapsed by default under an expandable disclosure badge (*"Show 8 Healthy Products"*), preventing visual clutter.

#### Layer 4 — Detail (Operational Workspaces)
Accessible via the task-oriented bottom bar and desktop navigation:
- **Stock**: Full searchable catalog with filters, pack units, and minimum reorder levels.
- **Buy**: Buying list with inline quantity adjustments (`[-]` and `[+]`) and pre-filled supplier offloading.
- **Collect**: Customer credit book, days overdue, and WhatsApp payment reminder generators.

#### Layer 5 — Administration & Governance (`More` Hub)
Organized cleanly under **More** (`setActiveTab("MORE")`), preventing administrative tools from cluttering daily sales:
- **Team & Staff Management**: Invite staff via secure links, set operational capabilities, suspend/reactivate staff, or transfer business ownership.
- **Financial Controls**: Shop expense tracker, daily cash drawer reconciliation, financial summaries.
- **Suppliers & Vendors**: Vendor directory, delivery histories, and purchase cost trends.
- **WhatsApp Assistant**: Plain-language conversational assistant for checking stock and recording sales.
- **System Governance**: Data export (JSON backup) and sample building-material inventory reset.

---

## 5. Staff Management & Capability Delegation

The owner can discover and manage staff naturally via `More → Staff & Team Management`:

1. **Invite Staff**: Enter staff member's name and optional email to generate a secure, 7-day invitation link.
2. **Direct Account Creation**: Quickly register counter clerks with an email and temporary password.
3. **Capability Delegation**: Staff accounts have strictly delegated operational authority. They can record sales, deliveries, and counts, but cannot view purchase costs, gross margins, supplier costs, or owner financial reports.
4. **Account Suspension & Reactivation**: 1-click toggle to suspend access if a clerk is on leave or terminated.
5. **Ownership Transfer**: Formal multi-step transfer workflow requiring current owner's password verification and documented reason.

---

## 6. Financial Truth: Concepts Explained Simply

Many shop owners mistakenly look only at total sales and assume their business is flourishing, only to find their bank account empty when suppliers demand payment. SISPA teaches and enforces the **Five Financial Truths**:

| Concept | What It Actually Means | Why It Matters |
| :--- | :--- | :--- |
| **Sales** | The total agreed price of all goods handed to customers during the period. | High sales does **not** mean you have money. If goods were taken on credit, cash has not yet entered your hands. |
| **Cash Collected** | Real physical money or verified bank transfers that actually arrived in your till today. | This is your true operational liquidity. You can only pay staff, rent, and suppliers with collected cash, not with sales on paper. |
| **Customer Debt** | Goods taken by builders and contractors that have not yet been paid for. | Uncontrolled credit starves your shop of working capital. SISPA tracks every debtor and days overdue so money is collected before jobs finish. |
| **Purchases (Restock)** | Money paid to manufacturers and suppliers for incoming inventory. | This is an asset exchange (cash converted into sellable inventory), not an expense that vanishes. |
| **Operating Expenses** | Running costs: diesel for the generator, shop rent, transport, repairs, lunch allowances. | These are the true expenses that reduce your take-home profit. |
| **Estimated Profit** | `Sales - Cost of Goods Sold - Operating Expenses`. | Your true commercial reward after accounting for what products cost you and what it cost to keep the doors open. |

---

## 7. How SISPA Stock Intelligence Works

SISPA translates raw yard numbers into plain, actionable advice:

### 1. Days Until Run-Out
SISPA continuously calculates your **average daily sales rate** over the past 7 and 30 days:
$$\text{Days of Stock} = \frac{\text{Current Available Quantity}}{\text{Average Daily Sales Rate}}$$

### 2. Lead Time & Safety Buffer
If your cement supplier takes **3 days** from order placement to offloading a trailer at your yard, ordering on Day 3 means you will run completely out of cement while the truck is in transit. SISPA factors in supplier lead times plus a safety buffer, triggering a **"Buy Now" (Running Low)** alert before your shelves hit zero.

### 3. Decision Control: Suggestion vs. Decision
SISPA suggests; the owner decides.
- On your **Buying List**, SISPA displays the recommended replenishment quantity.
- With one touch, you can adjust the quantity up or down with inline steppers (`[-]` and `[+]`).
- When the truck arrives at your yard, tap **"Delivered"** to pre-fill the arrival tally and update your stock ledger immediately.

---

## 8. Daily Operating Rhythm with SISPA

### Morning (3 Minutes): The Owner Home Pulse
1. Open SISPA on your phone or laptop.
2. Glance at **Sales Today**, **Cash Collected**, and **Customers Owing**.
3. Review **Needs Attention**: Buy critical stock, collect overdue debts, check stock counts.

### Throughout the Day: Fast Counter Operations
- **Selling Goods**: Tap **"Sell Goods"** (`[+]`). Search product, enter quantity, select customer (or walk-in), pick payment method (Cash, Bank Transfer, POS, Credit). Stock decrements instantly.
- **Truck Offloading**: Tap **"Receive Delivery"**. Select product, enter delivered quantity, enter supplier name. Stock increments immediately.
- **Contractor Payment**: When a builder arrives with cash or sends a bank transfer receipt, tap **"Collect Money"**, select customer, enter amount. Customer debt balance updates instantly.
- **Quick Stock Count**: Storekeeper walks down the yard, taps **"Count Stock"**, enters physical tally. Any discrepancy creates an auditable adjustment entry.

### Evening (3 Minutes): The Cash Drawer Check
1. Open `More → Check Cash Drawer`.
2. Count the physical cash in your safe/drawer.
3. Type the cash count into SISPA.
4. SISPA compares physical cash against recorded cash sales and cash debt payments:
   - **Matched**: Drawer balances perfectly.
   - **Over / Short**: Flags any difference immediately so discrepancies are investigated the same day.

---

## 9. Security, Multi-Tenant Isolation & Progressive Visibility

SISPA is engineered from the database layer upward with strict security:

1. **Strict Multi-Tenant Isolation**: Every database query is tenant-scoped by business identity. One shop cannot view another shop's data under any circumstance.
2. **Server-Side Financial Redaction**: Purchase costs, profit calculations, and supplier price history are stripped on the server before responses leave the backend when requested by staff accounts.
3. **Immutable Stock Ledger**: Stock quantities are never edited in place. Every change creates an immutable ledger entry (`SALE`, `RESTOCK`, `ADJUSTMENT`, `CORRECTION`) linked to the product and actor.
4. **Permanent Audit Trail**: Critical business operations (price changes, inventory adjustments, delivery cost updates, sale corrections, staff status changes) are written to the audit log with operator name, role, timestamp, old value, and new value.
5. **Platform Admin Zero Casual Access Guard**: Platform Admins have zero casual access to tenant stock or debts. To investigate an issue, an auditable, time-limited support grant must be created.
6. **Resilient Database Architecture**: Automatically connects to PostgreSQL when provisioned, and seamlessly falls back to an in-memory SQL database (`pg-mem`) with pre-seeded building-material inventory in standalone or preview environments.

---

*SISPA 1.0 — Smart Stock & Buying Assistant for Building-Material Wholesalers.*
