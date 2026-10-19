import { Navigate, Route, Routes } from 'react-router-dom';
import { TvPlayer } from '@/tv/pages/TvPlayer';
import { Dashboard } from '@/admin/pages/Dashboard';
import { ScreenEditor } from '@/admin/pages/ScreenEditor';
import { AdminGate } from '@/admin/components/AdminGate';
import { DEFAULT_SCREEN_IDS } from '@/shared/defaults';
import { useDeviceViewport } from '@/shared/hooks/useDeviceViewport';

/**
 * The root and the short `/w` alias open the primary TV (`wod`), so a device
 * handed the bare domain works without configuration. Additional TVs get
 * their own `/tv/:screenId` link from the panel, which lives at `/admin`.
 */
const HOME_SCREEN = DEFAULT_SCREEN_IDS[0];
const tvHome = `/tv/${HOME_SCREEN}`;

export default function App() {
  // Detect the device once per route tree so every screen adapts to the real
  // viewport (orientation, phone/tablet/TV) instead of assuming 16:9.
  useDeviceViewport();

  return (
    <Routes>
      <Route path="/" element={<Navigate to={tvHome} replace />} />
      <Route path="/w" element={<Navigate to={tvHome} replace />} />
      <Route path="/tv" element={<Navigate to={tvHome} replace />} />
      <Route
        path="/admin"
        element={
          <AdminGate>
            <Dashboard />
          </AdminGate>
        }
      />
      <Route
        path="/admin/:screenId"
        element={
          <AdminGate>
            <ScreenEditor />
          </AdminGate>
        }
      />
      <Route path="/tv/:screenId" element={<TvPlayer />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
