import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Shell } from './components/Shell';
import { Login } from './screens/Login';
import { MandateOverview } from './screens/MandateOverview';
import { AIBuyer } from './screens/AIBuyer';
import { Transactions } from './screens/Transactions';
import { Merchant } from './screens/Merchant';
import { ChainIntegrity } from './screens/ChainIntegrity';
import { Catalog } from './screens/Catalog';

function Routed() {
  const { session } = useAuth();

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/overview" element={<MandateOverview />} />
        <Route path="/buyer" element={<AIBuyer />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/merchant" element={<Merchant />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/audit" element={<ChainIntegrity />} />
      </Route>
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </AuthProvider>
  );
}
