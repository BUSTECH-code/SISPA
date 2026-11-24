"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { EnrichedProduct, EnrichedCustomer, BusinessException } from "@/server/stockService";
export type { EnrichedProduct, EnrichedCustomer, BusinessException };
import type { BusinessPeriodMetrics } from "@/domain/debt";
import type { Expense, AuditLog, DailyCashCheck } from "@/db/schema";
import {
  enqueueOfflineMutation,
  getAllMutations,
  syncAllPendingMutations,
  syncSingleMutation,
  deleteMutation,
  clearSyncedMutations,
  type OfflineMutation,
  type OfflineMutationType,
} from "@/lib/offlineQueue";
export type { OfflineMutation, OfflineMutationType };

export interface ActiveBusinessOption {
  businessId: number;
  name: string;
  currency: string;
  state: string;
  role: string;
  customCapabilities: string[];
}

export interface UserProfile {
  id: number;
  email: string;
  fullName: string;
  role: "OWNER" | "STAFF";
  businessName: string;
  businessOwnerId?: number | null;
  isPlatformAdmin?: boolean;
  delegatedCapabilities?: string[];
  activeBusinessId?: number | null;
}

export interface StaffProfile {
  id: number;
  userId?: number;
  email: string;
  fullName: string;
  role: string;
  businessName?: string;
  isActive?: boolean;
  status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | string;
  customCapabilities?: string[];
  invitedAt?: string | null;
  activatedAt?: string | null;
  suspendedAt?: string | null;
  deactivatedAt?: string | null;
  createdAt: string;
}

export interface StaffInvitationItem {
  id: number;
  token: string;
  inviteUrl?: string;
  inviteeName: string;
  inviteeEmail: string | null;
  role: string;
  status: string;
  customCapabilities?: string[];
  expiresAt: string;
  createdAt: string;
}

export interface BuyingItem {
  id: number;
  productId: number;
  productName: string;
  productUnit: string;
  category: string;
  quantityToBuy: number;
  isCompleted: boolean;
  estimatedUnitCost: string | null;
  supplierName: string | null;
  createdAt: string;
}

export interface ActivityItem {
  id: number;
  productId: number;
  productName: string;
  productUnit: string;
  entryType: "OPENING_BALANCE" | "SALE" | "RESTOCK" | "ADJUSTMENT" | "CORRECTION";
  quantityDelta: string;
  unitCost: string | null;
  supplierName: string | null;
  notes: string | null;
  createdAt: string;
  staffUserId?: number | null;
  staffName?: string | null;
}

export interface ReportData {
  metrics: BusinessPeriodMetrics;
  topDebtors: EnrichedCustomer[];
  urgentStockItems: EnrichedProduct[];
  recentActivities: ActivityItem[];
}

interface StockContextType {
  // Auth & Role
  user: UserProfile | null;
  activeBusinessId: number | null;
  availableBusinesses: ActiveBusinessOption[];
  selectActiveBusiness: (businessId: number) => Promise<{ success: boolean; error?: string }>;
  getBusinessHeaders: (overrideBusinessId?: number | null) => Record<string, string>;
  isAuthenticated: boolean;
  isOwner: boolean;
  login: (email: string, password: string, activeBusinessId?: number) => Promise<{ success: boolean; error?: string }>;
  signup: (params: { email: string; password: string; fullName: string; businessName?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;

  // Products & Stock
  products: EnrichedProduct[];
  counts: {
    total: number;
    runningLow: number;
    checkSoon: number;
    ok: number;
    noData: number;
    negativeStock: number;
  };

  // Customers & Debt (Collect)
  customers: EnrichedCustomer[];
  totalOutstandingDebt: number;
  debtorsCount: number;
  recordPayment: (customerId: number, amount: number, method?: string, notes?: string) => Promise<boolean>;

  // Shop Expenses
  expenses: Expense[];
  totalExpenses: number;
  recordShopExpense: (title: string, amount: number, category?: string, method?: string, notes?: string) => Promise<boolean>;

  // Buying List (Buy)
  buyingList: BuyingItem[];
  totalEstimatedOutlay: number;

  // Activities & Trustworthy Audit Trail
  activities: ActivityItem[];
  auditLogs: AuditLog[];

  // Suppliers & History
  suppliers: Array<{
    supplierName: string;
    deliveriesCount: number;
    productsSupplied: string[];
    lastDeliveryDate: string | null;
    lastPurchaseCost: number | null;
    previousPrices: Array<{
      productName: string;
      unitCost: number | null;
      quantity: number;
      date: string;
    }>;
  }>;

  // Daily Cash Checks & Exceptions
  dailyCashChecks: DailyCashCheck[];
  exceptions: BusinessException[];
  recordDailyCashCheck: (actualCash: number, notes?: string, checkDate?: string) => Promise<{ success: boolean; message?: string; error?: string }>;

  // Staff Management (Owner only)
  staffMembers: StaffProfile[];
  staffInvitations: StaffInvitationItem[];
  createStaffUser: (fullName: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  createStaffInvitation: (fullName: string, email?: string, customCapabilities?: string[]) => Promise<{ success: boolean; data?: any; error?: string }>;
  revokeStaffInvitation: (invitationId: number) => Promise<boolean>;
  updateStaffStatus: (staffUserId: number, newStatus: "ACTIVE" | "SUSPENDED" | "DEACTIVATED", reason?: string) => Promise<{ success: boolean; error?: string }>;
  updateStaffCapabilities: (staffUserId: number, capabilities: string[]) => Promise<{ success: boolean; error?: string }>;
  transferOwnership: (newOwnerUserId: number, passwordConfirmation: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  canPerform: (capKey: "CAN_SELL" | "CAN_RECEIVE" | "CAN_COLLECT" | "CAN_COUNT" | "CAN_CHANGE_PRICE" | "CAN_CORRECT_TRANSACTIONS" | string) => boolean;

  // Sale Correction & Delivery Purchase Cost
  recordSaleCorrection: (originalSaleId: number, correctedQuantityDelta: number, correctionReason: string) => Promise<boolean>;
  updateDeliveryCost: (ledgerEntryId: number, unitCost: number) => Promise<boolean>;
  exportBusinessBackup: () => void;

  // Periodic Reporting
  weeklyReport: ReportData | null;
  reportPeriodDays: number;
  setReportPeriodDays: (days: number) => void;

  isLoading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;

  // Modal controls
  activeModal:
    | "NONE"
    | "SALE"
    | "DELIVERY"
    | "COUNT"
    | "ADD_PRODUCT"
    | "PRODUCT_DETAILS"
    | "PAYMENT"
    | "EXPENSE"
    | "STOCK_CHECK"
    | "CASH_CHECK"
    | "STAFF_MANAGEMENT"
    | "UPDATE_COST"
    | "SALE_CORRECTION"
    | "AUTH";
  selectedProduct: EnrichedProduct | null;
  selectedCustomer: EnrichedCustomer | null;
  selectedLedgerEntry: ActivityItem | null;
  openRecordSale: (product?: EnrichedProduct) => void;
  openRecordDelivery: (product?: EnrichedProduct) => void;
  openCountStock: (product?: EnrichedProduct) => void;
  openAddProduct: () => void;
  openProductDetails: (product: EnrichedProduct) => void;
  openRecordPayment: (customer?: EnrichedCustomer) => void;
  openRecordExpense: () => void;
  openStockCheck: () => void;
  openCashCheck: () => void;
  openStaffManagement: () => void;
  openUpdateCost: (entry: ActivityItem) => void;
  openSaleCorrection: () => void;
  openAuthModal: () => void;
  closeModal: () => void;

  isPlatformAdmin: boolean;

  // Active view tab
  activeTab: "HOME" | "STOCK" | "DEBT" | "BUYING" | "REPORTS" | "EXPENSES" | "SUPPLIERS" | "ACTIVITY" | "AUDIT" | "WHATSAPP" | "PLATFORM_ADMIN" | "MORE";
  setActiveTab: (tab: "HOME" | "STOCK" | "DEBT" | "BUYING" | "REPORTS" | "EXPENSES" | "SUPPLIERS" | "ACTIVITY" | "AUDIT" | "WHATSAPP" | "PLATFORM_ADMIN" | "MORE") => void;

  // Actions
  addToBuyingList: (product: EnrichedProduct, customQty?: number) => Promise<boolean>;
  toggleBuyingItem: (id: number, isCompleted: boolean) => Promise<boolean>;
  updateBuyingItemQty: (id: number, quantityToBuy: number) => Promise<boolean>;
  removeBuyingItem: (id: number) => Promise<boolean>;
  clearCompletedBuyingItems: () => Promise<boolean>;
  resetWithDemoData: () => Promise<void>;

  // Offline Architecture & Outbox
  isOnline: boolean;
  offlineQueue: OfflineMutation[];
  isSyncingQueue: boolean;
  isOfflineQueueOpen: boolean;
  openOfflineQueue: () => void;
  closeOfflineQueue: () => void;
  syncQueueNow: () => Promise<void>;
  retrySingleOfflineMutation: (mutation: OfflineMutation) => Promise<void>;
  discardOfflineMutation: (id: string) => Promise<void>;
  clearSyncedQueueItems: () => Promise<void>;
  enqueueLocalMutation: (params: {
    type: OfflineMutationType;
    endpoint: string;
    payload: any;
    summary: string;
  }) => Promise<OfflineMutation | null>;
}

const StockContext = createContext<StockContextType | undefined>(undefined);

export function StockProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeBusinessId, setActiveBusinessId] = useState<number | null>(null);
  const [availableBusinesses, setAvailableBusinesses] = useState<ActiveBusinessOption[]>([]);
  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    runningLow: 0,
    checkSoon: 0,
    ok: 0,
    noData: 0,
    negativeStock: 0,
  });

  const [customers, setCustomers] = useState<EnrichedCustomer[]>([]);
  const [totalOutstandingDebt, setTotalOutstandingDebt] = useState(0);
  const [debtorsCount, setDebtorsCount] = useState(0);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);

  const [buyingList, setBuyingList] = useState<BuyingItem[]>([]);
  const [totalEstimatedOutlay, setTotalEstimatedOutlay] = useState(0);

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [dailyCashChecks, setDailyCashChecks] = useState<DailyCashCheck[]>([]);
  const [exceptions, setExceptions] = useState<BusinessException[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffProfile[]>([]);
  const [staffInvitations, setStaffInvitations] = useState<StaffInvitationItem[]>([]);

  const [weeklyReport, setWeeklyReport] = useState<ReportData | null>(null);
  const [reportPeriodDays, setReportPeriodDays] = useState(7);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation and Modals
  const [activeTab, setActiveTab] = useState<
    "HOME" | "STOCK" | "DEBT" | "BUYING" | "REPORTS" | "EXPENSES" | "SUPPLIERS" | "ACTIVITY" | "AUDIT" | "WHATSAPP" | "PLATFORM_ADMIN" | "MORE"
  >("HOME");
  const [suppliers, setSuppliers] = useState<StockContextType["suppliers"]>([]);

  const [activeModal, setActiveModal] = useState<
    | "NONE"
    | "SALE"
    | "DELIVERY"
    | "COUNT"
    | "ADD_PRODUCT"
    | "PRODUCT_DETAILS"
    | "PAYMENT"
    | "EXPENSE"
    | "STOCK_CHECK"
    | "CASH_CHECK"
    | "STAFF_MANAGEMENT"
    | "UPDATE_COST"
    | "SALE_CORRECTION"
    | "AUTH"
  >("NONE");

  const [selectedProduct, setSelectedProduct] = useState<EnrichedProduct | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<EnrichedCustomer | null>(null);
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<ActivityItem | null>(null);

  // Offline Architecture State & Outbox
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineMutation[]>([]);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [isOfflineQueueOpen, setIsOfflineQueueOpen] = useState(false);

  const openOfflineQueue = () => setIsOfflineQueueOpen(true);
  const closeOfflineQueue = () => setIsOfflineQueueOpen(false);

  const refreshOfflineQueue = useCallback(async (currentUserId?: number) => {
    try {
      const q = await getAllMutations(currentUserId);
      setOfflineQueue(q);
    } catch {
      // IndexedDB not ready
    }
  }, []);

  const getBusinessHeaders = useCallback(
    (overrideBusinessId?: number | null): Record<string, string> => {
      const targetBizId = overrideBusinessId ?? activeBusinessId;
      return targetBizId ? { "X-Business-Id": String(targetBizId) } : {};
    },
    [activeBusinessId]
  );

  // Check auth session
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (json.success && json.data.user) {
        const nextBizId: number | null = json.data.activeBusinessId ?? null;
        setUser(json.data.user);
        setActiveBusinessId(nextBizId);
        setAvailableBusinesses(json.data.availableBusinesses || []);
        return { user: json.data.user as UserProfile, activeBusinessId: nextBizId };
      } else {
        setUser(null);
        setActiveBusinessId(null);
        setAvailableBusinesses([]);
        return { user: null, activeBusinessId: null };
      }
    } catch {
      setUser(null);
      setActiveBusinessId(null);
      setAvailableBusinesses([]);
      return { user: null, activeBusinessId: null };
    }
  }, []);

  const fetchProducts = useCallback(async (bizId: number) => {
    try {
      const res = await fetch("/api/products", {
        headers: { "X-Business-Id": String(bizId) },
      });
      const json = await res.json();
      if (json.success) {
        setProducts(json.data.products);
        setCounts(json.data.counts);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchCustomers = useCallback(async (bizId: number) => {
    try {
      const res = await fetch("/api/customers", {
        headers: { "X-Business-Id": String(bizId) },
      });
      const json = await res.json();
      if (json.success) {
        setCustomers(json.data.customers);
        setTotalOutstandingDebt(json.data.totalOutstandingDebt);
        setDebtorsCount(json.data.debtorsCount);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchExpenses = useCallback(async (bizId: number) => {
    try {
      const res = await fetch("/api/expenses", {
        headers: { "X-Business-Id": String(bizId) },
      });
      const json = await res.json();
      if (json.success) {
        setExpenses(json.data.expenses);
        setTotalExpenses(json.data.totalExpenses);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchBuyingList = useCallback(async (bizId?: number | null) => {
    const targetBizId = bizId ?? activeBusinessId;
    if (!targetBizId) return;
    try {
      const res = await fetch("/api/buying-list", {
        headers: { "X-Business-Id": String(targetBizId) },
      });
      const json = await res.json();
      if (json.success) {
        setBuyingList(json.data.items);
        setTotalEstimatedOutlay(json.data.totalEstimatedOutlay);
      }
    } catch (err) {
      console.error(err);
    }
  }, [activeBusinessId]);

  const fetchActivities = useCallback(async (bizId: number) => {
    try {
      const res = await fetch("/api/activity", {
        headers: { "X-Business-Id": String(bizId) },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setActivities(json.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchAuditLogs = useCallback(async (bizId: number) => {
    try {
      const res = await fetch("/api/audit", {
        headers: { "X-Business-Id": String(bizId) },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setAuditLogs(json.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchCashChecks = useCallback(async (bizId: number) => {
    try {
      const res = await fetch("/api/cash-check", {
        headers: { "X-Business-Id": String(bizId) },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setDailyCashChecks(json.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchExceptions = useCallback(async (bizId: number) => {
    try {
      const res = await fetch("/api/exceptions", {
        headers: { "X-Business-Id": String(bizId) },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setExceptions(json.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchStaff = useCallback(async (isOwnerUser: boolean, bizId: number) => {
    if (!isOwnerUser) {
      setStaffMembers([]);
      setStaffInvitations([]);
      return;
    }
    try {
      const res = await fetch("/api/staff", {
        headers: { "X-Business-Id": String(bizId) },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          if (json.data && json.data.staff) {
            setStaffMembers(json.data.staff);
            setStaffInvitations(json.data.invitations || []);
          } else if (Array.isArray(json.data)) {
            setStaffMembers(json.data);
            setStaffInvitations([]);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchSuppliers = useCallback(async (bizId: number) => {
    try {
      const res = await fetch("/api/suppliers", {
        headers: { "X-Business-Id": String(bizId) },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setSuppliers(json.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchReport = useCallback(async (days: number = 7, bizId?: number | null) => {
    const targetBizId = bizId ?? activeBusinessId;
    if (!targetBizId) return;
    try {
      const res = await fetch(`/api/reports?days=${days}`, {
        headers: { "X-Business-Id": String(targetBizId) },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setWeeklyReport(json.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [activeBusinessId]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    const { user: currentUser, activeBusinessId: currentBizId } = await checkAuth();
    if (currentUser && currentBizId) {
      const isOwnerRole = currentUser.role === "OWNER";
      await Promise.all([
        fetchProducts(currentBizId),
        fetchCustomers(currentBizId),
        fetchExpenses(currentBizId),
        fetchBuyingList(currentBizId),
        fetchActivities(currentBizId),
        fetchAuditLogs(currentBizId),
        fetchCashChecks(currentBizId),
        fetchExceptions(currentBizId),
        fetchStaff(isOwnerRole, currentBizId),
        fetchSuppliers(currentBizId),
        fetchReport(reportPeriodDays, currentBizId),
      ]);
    } else {
      setProducts([]);
      setCustomers([]);
      setExpenses([]);
      setBuyingList([]);
      setActivities([]);
      setAuditLogs([]);
      setDailyCashChecks([]);
      setExceptions([]);
      setStaffMembers([]);
      setSuppliers([]);
      setWeeklyReport(null);
      setCounts({ total: 0, runningLow: 0, checkSoon: 0, ok: 0, noData: 0, negativeStock: 0 });
    }
    setIsLoading(false);
  }, [
    checkAuth,
    fetchProducts,
    fetchCustomers,
    fetchExpenses,
    fetchBuyingList,
    fetchActivities,
    fetchAuditLogs,
    fetchCashChecks,
    fetchExceptions,
    fetchStaff,
    fetchSuppliers,
    fetchReport,
    reportPeriodDays,
  ]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const selectActiveBusiness = async (businessId: number) => {
    try {
      const res = await fetch("/api/auth/active-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeBusinessId: businessId }),
      });
      const json = await res.json();
      if (json.success) {
        setActiveBusinessId(json.data.activeBusinessId);
        setAvailableBusinesses(json.data.availableBusinesses || []);
        await refreshData();
        return { success: true };
      }
      return { success: false, error: json.error || "Failed to select active business." };
    } catch {
      return { success: false, error: "Network error selecting active business." };
    }
  };

  // Auth actions
  const login = async (email: string, password: string, requestedBusinessId?: number) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(requestedBusinessId ? { activeBusinessId: requestedBusinessId } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setUser(json.data);
        setActiveBusinessId(json.data.activeBusinessId ?? null);
        setAvailableBusinesses(json.data.availableBusinesses || []);
        await refreshData();
        closeModal();
        return { success: true };
      }
      return { success: false, error: json.error || "Failed to log in." };
    } catch {
      return { success: false, error: "Network error logging in." };
    }
  };

  const signup = async (params: {
    email: string;
    password: string;
    fullName: string;
    businessName?: string;
  }) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const json = await res.json();
      if (json.success) {
        setUser(json.data);
        setActiveBusinessId(json.data.activeBusinessId ?? null);
        setAvailableBusinesses(json.data.availableBusinesses || []);
        await refreshData();
        closeModal();
        return { success: true };
      }
      return { success: false, error: json.error || "Failed to create account." };
    } catch {
      return { success: false, error: "Network error creating account." };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/me", { method: "POST" });
      setUser(null);
      setActiveBusinessId(null);
      setAvailableBusinesses([]);
      setProducts([]);
      setCustomers([]);
      setExpenses([]);
      setBuyingList([]);
      setActivities([]);
      setAuditLogs([]);
      setDailyCashChecks([]);
      setExceptions([]);
      setWeeklyReport(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const openRecordSale = (product?: EnrichedProduct) => {
    setSelectedProduct(product || null);
    setActiveModal("SALE");
  };

  const openRecordDelivery = (product?: EnrichedProduct) => {
    setSelectedProduct(product || null);
    setActiveModal("DELIVERY");
  };

  const openCountStock = (product?: EnrichedProduct) => {
    setSelectedProduct(product || null);
    setActiveModal("COUNT");
  };

  const openAddProduct = () => {
    setSelectedProduct(null);
    setActiveModal("ADD_PRODUCT");
  };

  const openProductDetails = (product: EnrichedProduct) => {
    setSelectedProduct(product);
    setActiveModal("PRODUCT_DETAILS");
  };

  const openRecordPayment = (customer?: EnrichedCustomer) => {
    setSelectedCustomer(customer || null);
    setActiveModal("PAYMENT");
  };

  const openRecordExpense = () => {
    setActiveModal("EXPENSE");
  };

  const openStockCheck = () => {
    setActiveModal("STOCK_CHECK");
  };

  const openCashCheck = () => {
    setActiveModal("CASH_CHECK");
  };

  const openStaffManagement = () => {
    setActiveModal("STAFF_MANAGEMENT");
  };

  const openUpdateCost = (entry: ActivityItem) => {
    setSelectedLedgerEntry(entry);
    setActiveModal("UPDATE_COST");
  };

  const openSaleCorrection = () => {
    setActiveModal("SALE_CORRECTION");
  };

  const openAuthModal = () => {
    setActiveModal("AUTH");
  };

  const closeModal = () => {
    setActiveModal("NONE");
    setSelectedProduct(null);
    setSelectedCustomer(null);
    setSelectedLedgerEntry(null);
  };

  // Enqueue local mutation to outbox
  const enqueueLocalMutation = useCallback(
    async (params: {
      type: OfflineMutationType;
      endpoint: string;
      payload: any;
      summary: string;
    }): Promise<OfflineMutation | null> => {
      if (!user || !activeBusinessId) return null;
      try {
        const m = await enqueueOfflineMutation({
          businessId: activeBusinessId,
          userId: user.id,
          userRole: user.role,
          actorName: user.fullName,
          type: params.type,
          endpoint: params.endpoint,
          payload: params.payload,
          summary: params.summary,
        });
        await refreshOfflineQueue(user.id);
        return m;
      } catch (err) {
        console.error("Failed to enqueue mutation:", err);
        return null;
      }
    },
    [user, activeBusinessId, refreshOfflineQueue]
  );

  // Sync entire pending queue
  const syncQueueNow = useCallback(async () => {
    if (!user || isSyncingQueue) return;
    setIsSyncingQueue(true);
    try {
      await syncAllPendingMutations(user.id, user.role);
      await refreshOfflineQueue(user.id);
      await refreshData();
    } catch (err) {
      console.error("Failed to sync offline queue:", err);
    } finally {
      setIsSyncingQueue(false);
    }
  }, [user, isSyncingQueue, refreshOfflineQueue, refreshData]);

  // Network online/offline event listeners
  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      if (user?.id) {
        syncQueueNow();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [user?.id, syncQueueNow]);

  // Load offline queue on user login or change
  useEffect(() => {
    if (user?.id) {
      refreshOfflineQueue(user.id);
    } else {
      setOfflineQueue([]);
    }
  }, [user?.id, refreshOfflineQueue]);

  const retrySingleOfflineMutation = async (mutation: OfflineMutation) => {
    if (!user) return;
    setIsSyncingQueue(true);
    try {
      await syncSingleMutation(mutation);
      await refreshOfflineQueue(user.id);
      await refreshData();
    } finally {
      setIsSyncingQueue(false);
    }
  };

  const discardOfflineMutation = async (id: string) => {
    await deleteMutation(id);
    if (user?.id) await refreshOfflineQueue(user.id);
  };

  const clearSyncedQueueItems = async () => {
    await clearSyncedMutations(user?.id);
    if (user?.id) await refreshOfflineQueue(user.id);
  };

  const recordPayment = async (
    customerId: number,
    amount: number,
    method?: string,
    notes?: string
  ): Promise<boolean> => {
    const cust = customers.find((c) => c.id === customerId);
    const summary = `Collected ₦${amount.toLocaleString()} from ${cust?.name || "Customer"}`;

    // If completely offline, enqueue directly and apply optimistic local balance reduction
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueLocalMutation({
        type: "PAYMENT",
        endpoint: "/api/customers",
        payload: {
          customerId,
          amount,
          paymentMethod: method || "CASH",
          notes,
        },
        summary,
      });

      // Optimistic update
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customerId
            ? { ...c, outstandingBalance: Math.max(0, c.outstandingBalance - amount) }
            : c
        )
      );
      setTotalOutstandingDebt((prev) => Math.max(0, prev - amount));
      return true;
    }

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({
          customerId,
          amount,
          paymentMethod: method || "CASH",
          notes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch {
      // Network dropped during transmission -> enqueue to offline outbox
      await enqueueLocalMutation({
        type: "PAYMENT",
        endpoint: "/api/customers",
        payload: {
          customerId,
          amount,
          paymentMethod: method || "CASH",
          notes,
        },
        summary,
      });

      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customerId
            ? { ...c, outstandingBalance: Math.max(0, c.outstandingBalance - amount) }
            : c
        )
      );
      setTotalOutstandingDebt((prev) => Math.max(0, prev - amount));
      return true;
    }
  };

  const recordShopExpense = async (
    title: string,
    amount: number,
    category?: string,
    method?: string,
    notes?: string
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({
          title,
          amount,
          category,
          paymentMethod: method,
          notes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const recordDailyCashCheck = async (
    actualCash: number,
    notes?: string,
    checkDate?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const res = await fetch("/api/cash-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({
          actualCash,
          notes,
          checkDate,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return { success: true, message: json.message };
      }
      return { success: false, error: json.error || "Failed to save cash check." };
    } catch {
      return { success: false, error: "Network error saving cash check." };
    }
  };

  const createStaffUser = async (
    fullName: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({ action: "CREATE_DIRECT", fullName, email, password }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return { success: true };
      }
      return { success: false, error: json.error || "Failed to create staff member." };
    } catch {
      return { success: false, error: "Network error creating staff member." };
    }
  };

  const canPerform = (capKey: "CAN_SELL" | "CAN_RECEIVE" | "CAN_COLLECT" | "CAN_COUNT" | "CAN_CHANGE_PRICE" | "CAN_CORRECT_TRANSACTIONS" | string): boolean => {
    if (!user) return false;
    if (user.role === "OWNER" || user.isPlatformAdmin) return true;
    const caps = (user.delegatedCapabilities && user.delegatedCapabilities.length > 0)
      ? user.delegatedCapabilities
      : ["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"];
    return (
      caps.includes(capKey) ||
      (capKey === "CAN_SELL" && caps.includes("SALE_CREATE")) ||
      (capKey === "CAN_RECEIVE" && caps.includes("DELIVERY_CREATE")) ||
      (capKey === "CAN_COLLECT" && caps.includes("PAYMENT_CREATE")) ||
      (capKey === "CAN_COUNT" && caps.includes("STOCK_COUNT")) ||
      (capKey === "CAN_CHANGE_PRICE" && caps.includes("SELLING_PRICE_CHANGE")) ||
      (capKey === "CAN_CORRECT_TRANSACTIONS" && caps.includes("SALE_CORRECTION"))
    );
  };

  const createStaffInvitation = async (
    fullName: string,
    email?: string,
    customCapabilities?: string[]
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({ action: "INVITE", fullName, email, customCapabilities }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return { success: true, data: json.data };
      }
      return { success: false, error: json.error || "Failed to generate invitation link." };
    } catch {
      return { success: false, error: "Network error generating invitation link." };
    }
  };

  const revokeStaffInvitation = async (invitationId: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/staff?invitationId=${invitationId}`, {
        method: "DELETE",
        headers: getBusinessHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const updateStaffStatus = async (
    staffUserId: number,
    newStatus: "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({ action: "UPDATE_STATUS", staffUserId, newStatus, reason }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return { success: true };
      }
      return { success: false, error: json.error || "Failed to update staff status." };
    } catch {
      return { success: false, error: "Network error updating staff status." };
    }
  };

  const updateStaffCapabilities = async (
    staffUserId: number,
    capabilities: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({ action: "UPDATE_CAPABILITIES", staffUserId, capabilities }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return { success: true };
      }
      return { success: false, error: json.error || "Failed to update staff capabilities." };
    } catch {
      return { success: false, error: "Network error updating staff capabilities." };
    }
  };

  const transferOwnership = async (
    newOwnerUserId: number,
    passwordConfirmation: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/staff", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({
          action: "TRANSFER_OWNERSHIP",
          newOwnerUserId,
          passwordConfirmation,
          reason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return { success: true };
      }
      return { success: false, error: json.error || "Failed to transfer ownership." };
    } catch {
      return { success: false, error: "Network error transferring ownership." };
    }
  };

  const recordSaleCorrection = async (
    originalSaleId: number,
    correctedQuantityDelta: number,
    correctionReason: string
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/sales/${originalSaleId}/correction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({ correctedQuantityDelta, correctionReason }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const updateDeliveryCost = async (
    ledgerEntryId: number,
    unitCost: number
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/deliveries/${ledgerEntryId}/cost`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({ unitCost }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const exportBusinessBackup = () => {
    const url = activeBusinessId ? `/api/export?activeBusinessId=${activeBusinessId}` : "/api/export";
    window.open(url, "_blank");
  };

  const addToBuyingList = async (product: EnrichedProduct, customQty?: number): Promise<boolean> => {
    try {
      const qty = customQty || product.intelligence.suggestedPurchaseQuantity || 1;
      const cost = product.lastSupplierInfo?.unitCost || null;
      const supplier = product.lastSupplierInfo?.supplierName || null;

      const res = await fetch("/api/buying-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({
          productId: product.id,
          quantityToBuy: qty,
          estimatedUnitCost: cost,
          supplierName: supplier,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchBuyingList();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const toggleBuyingItem = async (id: number, isCompleted: boolean): Promise<boolean> => {
    try {
      const res = await fetch("/api/buying-list", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({ id, isCompleted }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchBuyingList();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const updateBuyingItemQty = async (id: number, quantityToBuy: number): Promise<boolean> => {
    try {
      const res = await fetch("/api/buying-list", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getBusinessHeaders(),
        },
        body: JSON.stringify({ id, quantityToBuy }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchBuyingList();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const removeBuyingItem = async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/buying-list?id=${id}`, {
        method: "DELETE",
        headers: getBusinessHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        await fetchBuyingList();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const clearCompletedBuyingItems = async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/buying-list?clearCompleted=true`, {
        method: "DELETE",
        headers: getBusinessHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        await fetchBuyingList();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const resetWithDemoData = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/seed", {
        method: "POST",
        headers: getBusinessHeaders(),
      });
      await refreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StockContext.Provider
      value={{
        user,
        activeBusinessId,
        availableBusinesses,
        selectActiveBusiness,
        getBusinessHeaders,
        isAuthenticated: !!user,
        isOwner: user?.role === "OWNER",
        isPlatformAdmin: !!user?.isPlatformAdmin,
        login,
        signup,
        logout,
        products,
        counts,
        customers,
        totalOutstandingDebt,
        debtorsCount,
        recordPayment,
        expenses,
        totalExpenses,
        recordShopExpense,
        buyingList,
        totalEstimatedOutlay,
        activities,
        auditLogs,
        suppliers,
        dailyCashChecks,
        exceptions,
        recordDailyCashCheck,
        staffMembers,
        staffInvitations,
        createStaffUser,
        createStaffInvitation,
        revokeStaffInvitation,
        updateStaffStatus,
        updateStaffCapabilities,
        transferOwnership,
        canPerform,
        recordSaleCorrection,
        updateDeliveryCost,
        exportBusinessBackup,
        weeklyReport,
        reportPeriodDays,
        setReportPeriodDays,
        isLoading,
        error,
        refreshData,
        activeModal,
        selectedProduct,
        selectedCustomer,
        selectedLedgerEntry,
        openRecordSale,
        openRecordDelivery,
        openCountStock,
        openAddProduct,
        openProductDetails,
        openRecordPayment,
        openRecordExpense,
        openStockCheck,
        openCashCheck,
        openStaffManagement,
        openUpdateCost,
        openSaleCorrection,
        openAuthModal,
        closeModal,
        activeTab,
        setActiveTab,
        addToBuyingList,
        toggleBuyingItem,
        updateBuyingItemQty,
        removeBuyingItem,
        clearCompletedBuyingItems,
        resetWithDemoData,
        isOnline,
        offlineQueue,
        isSyncingQueue,
        isOfflineQueueOpen,
        openOfflineQueue,
        closeOfflineQueue,
        syncQueueNow,
        retrySingleOfflineMutation,
        discardOfflineMutation,
        clearSyncedQueueItems,
        enqueueLocalMutation,
      }}
    >
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error("useStock must be used within a StockProvider");
  }
  return context;
}
