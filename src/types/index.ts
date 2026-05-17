import { Timestamp } from 'firebase/firestore';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  lineId: string | null;
  profileCompleted: boolean;
  createdAt: Timestamp;
  purchasedCourses: string[];
}

export type InvoiceType = 'b2c_email' | 'b2c_carrier' | 'b2c_donate' | 'b2b';

export interface InvoiceInfo {
  type: InvoiceType;
  carrierNum?: string;
  loveCode?: string;
  companyName?: string;
  companyTaxId?: string;
}

export interface Chapter {
  id: string;
  title: string;
  bunnyVideoId: string;
  order: number;
  duration: number;
}

export interface DownloadFile {
  id: string;
  name: string;
  note?: string;
  url: string;
  storagePath: string;
  size: number;
  folderId?: string;
}

export interface DownloadFolder {
  id: string;
  name: string;
}

export interface PromptItem {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface NoRefundResources {
  lineGroupUrl: string;
  downloadFiles: DownloadFile[];
  downloadFolders?: DownloadFolder[];
}

export interface Course {
  id: string;
  title: string;
  description: string;
  price: number;
  thumbnail: string;
  isPublished: boolean;
  chapters: Chapter[];
  prompts?: PromptItem[];
  noRefundResources?: NoRefundResources;
  createdAt: Timestamp;
  // 升級主課程設定（引流課用）
  upgradeTo?: string;          // 升級到哪個課程 ID（主課程）
  upgradeDiscount?: number;    // 升級時可折抵的金額（例如 299）
  upgradeWindowDays?: number;  // 升級期限天數（0 = 無限期，預設 7）
}

export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';
export type PaymentMethod = 'credit_card' | 'virtual_account';

export type RefundStatus = 'refund_pending' | 'refunded';

export interface RefundBankInfo {
  bankName: string;
  branchName: string;
  accountNumber: string;
  accountName: string;
}

export interface Order {
  id: string;
  merchantOrderNo: string;
  userId: string;
  userEmail: string;
  courseId: string;
  courseTitle: string;
  amount: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  newebpayTradeNo: string;
  virtualAccount: string | null;
  paidAt: Timestamp | null;
  reminderSentDays: number[];
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  createdAt: Timestamp;
  // Invoice fields
  invoiceNumber?: string;
  invoiceRandomNum?: string;
  // Refund fields
  refundStatus?: RefundStatus;
  refundBankInfo?: RefundBankInfo;
  requiresRefundForm?: boolean;
  refundFormPhoto?: string;
  refundRequestedAt?: Timestamp;
  refundCompletedAt?: Timestamp;
  refundFormUploadedAt?: Timestamp;
  // 不退費使用區
  refundWaived?: boolean;
  refundWaivedAt?: Timestamp;
  refundWaivedReason?: string;
  lineGroupStatus?: 'none' | 'applying' | 'joined';
  lineGroupAppliedAt?: Timestamp;
  lineGroupConfirmedAt?: Timestamp;
}

export interface Invoice {
  orderId: string;
  invoiceNumber: string;
  status: 'issued' | 'cancelled';
  issuedAt: Timestamp;
}

export interface Admin {
  uid: string;
  email: string;
  role: 'superadmin' | 'staff';
  createdAt: Timestamp;
}

export interface CartItem {
  courseId: string;
  title: string;
  price: number;
  thumbnail: string;
}
