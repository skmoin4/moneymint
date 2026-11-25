import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { LedgerPage } from "./pages/LedgerPage";
import { RechargePage } from "./pages/RechargePage";
import { BillPaymentPage } from "./pages/BillPaymentPage";
import { DmtPage } from "./pages/DmtPage";
import { AepsPage } from "./pages/AepsPage";
import { KycPage } from "./pages/KycPage";
import { ComplaintsPage } from "./pages/ComplaintsPage";
import { UsersPage } from "./pages/UsersPage";
import { TransferPage } from "./pages/TransferPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { OperatorsPage } from "./pages/OperatorsPage";
import { OperatorDetailPage } from "./pages/OperatorDetailPage";
import { CommissionPage } from "./pages/CommissionPage";
import { BalanceRequestsPage } from "./pages/BalanceRequestsPage";
import { BankDetailsPage } from "./pages/BankDetailsPage";
import { PendingPage } from "./pages/PendingPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SecurityPage } from "./pages/SecurityPage";
import { CirclesPage } from "./pages/CirclesPage";
import { ProviderApiSettingPage } from "./pages/ProviderApiSettingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PaymentModesPage } from "./pages/PaymentModesPage";
import { BroadcastPage } from "./pages/BroadcastPage";
import { QRechargePage } from "./pages/QRechargePage";
import { ManualTxnPage } from "./pages/ManualTxnPage";
import { OperatorPrefixesPage } from "./pages/OperatorPrefixesPage";
import { RechargePlansPage } from "./pages/RechargePlansPage";
import { CashbackOffersPage } from "./pages/CashbackOffersPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/recharge" element={<RechargePage />} />
              <Route path="/bill-payment" element={<BillPaymentPage />} />
              <Route path="/dmt" element={<DmtPage />} />
              <Route path="/aeps" element={<AepsPage />} />
              <Route path="/kyc" element={<KycPage />} />
              <Route path="/complaints" element={<ComplaintsPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/ledger" element={<LedgerPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/transfer" element={<TransferPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/operators" element={<OperatorsPage />} />
              <Route path="/operators/:id" element={<OperatorDetailPage />} />
              <Route path="/commission" element={<CommissionPage />} />
              <Route path="/balance-requests" element={<BalanceRequestsPage />} />
              <Route path="/bank-details" element={<BankDetailsPage />} />
              <Route path="/pending" element={<PendingPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/circles" element={<CirclesPage />} />
              <Route path="/provider-api-setting" element={<ProviderApiSettingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/payment-modes" element={<PaymentModesPage />} />
              <Route path="/broadcast" element={<BroadcastPage />} />
              <Route path="/q-recharge" element={<QRechargePage />} />
              <Route path="/manual-txn" element={<ManualTxnPage />} />
              <Route path="/operator-prefixes" element={<OperatorPrefixesPage />} />
              <Route path="/recharge-plans" element={<RechargePlansPage />} />
              <Route path="/cashback-offers" element={<CashbackOffersPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
