import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Shell } from './components/Shell';
import { Login } from './screens/Login';
import { MandateOverview } from './screens/MandateOverview';
import { Approvals } from './screens/Approvals';
import { Timeline } from './screens/Timeline';
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
        <Route path="/mandate" element={<MandateOverview />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/chain" element={<ChainIntegrity />} />
        <Route path="/catalog" element={<Catalog />} />
      </Route>
      <Route path="*" element={<Navigate to="/mandate" replace />} />
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
