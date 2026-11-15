import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

/* Layouts (kept static for immediate navigation shell) */
import PublicLayout from '../layouts/PublicLayout';
import PatientLayout from '../layouts/PatientLayout';
import DoctorLayout from '../layouts/DoctorLayout';
import AdminLayout from '../layouts/AdminLayout';

/* Route guards */
import ProtectedRoute, { GuestRoute } from '../components/auth/ProtectedRoute';

/* Lazy-loaded Public pages */
const LandingPage = lazy(() => import('../pages/Landing/LandingPage'));
const GetStartedPage = lazy(() => import('../pages/Landing/GetStartedPage'));
const PortalPreviewPage = lazy(() => import('../pages/Demo/PortalPreviewPage'));
const NotFound = lazy(() => import('../pages/NotFound'));

/* Lazy-loaded Authentication pages */
const LoginPage = lazy(() => import('../pages/Authentication/LoginPage'));
const PatientRegisterPage = lazy(() => import('../pages/Authentication/PatientRegisterPage'));
const DoctorRegisterPage = lazy(() => import('../pages/Authentication/DoctorRegisterPage'));
const PendingVerificationPage = lazy(() => import('../pages/Authentication/PendingVerificationPage'));

/* Lazy-loaded Patient portal */
const PatientDashboard = lazy(() => import('../pages/Patient/PatientDashboard'));
const MedicalRecords = lazy(() => import('../pages/Patient/MedicalRecords'));
const DoctorAccessRequests = lazy(() => import('../pages/Patient/DoctorAccessRequests'));
const ActiveConsents = lazy(() => import('../pages/Patient/ActiveConsents'));
const ConsentHistory = lazy(() => import('../pages/Patient/ConsentHistory'));
const PatientAccessHistory = lazy(() => import('../pages/Patient/AccessHistory'));
const PatientProfile = lazy(() => import('../pages/Patient/MyProfile'));
const PatientSettings = lazy(() => import('../pages/Patient/Settings'));

/* Lazy-loaded Doctor portal */
const DoctorDashboard = lazy(() => import('../pages/Doctor/DoctorDashboard'));
const DoctorPatients = lazy(() => import('../pages/Doctor/Patients'));
const RequestMedicalRecords = lazy(() => import('../pages/Doctor/RequestMedicalRecords'));
const MyRequests = lazy(() => import('../pages/Doctor/MyRequests'));
const AccessibleRecords = lazy(() => import('../pages/Doctor/AccessibleRecords'));
const DoctorAccessHistory = lazy(() => import('../pages/Doctor/AccessHistory'));
const DoctorProfile = lazy(() => import('../pages/Doctor/MyProfile'));

/* Lazy-loaded Admin portal */
const AdminDashboard = lazy(() => import('../pages/Admin/AdminDashboard'));
const ManagePatients = lazy(() => import('../pages/Admin/ManagePatients'));
const VerifyDoctors = lazy(() => import('../pages/Admin/VerifyDoctors'));
const ManageUsers = lazy(() => import('../pages/Admin/ManageUsers'));
const ActivityLogs = lazy(() => import('../pages/Admin/ActivityLogs'));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center py-16" role="status" aria-label="Loading page">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary-500 border-t-transparent" />
        <span className="text-xs font-medium text-slate-400">Loading MediConsent...</span>
      </div>
    </div>
  );
}

/**
 * Application routes.
 *
 * Access control is enforced by the backend; these guards only decide which
 * screen to render. The role used by `ProtectedRoute` always comes from the
 * `GET /api/v1/auth/me` response — never from the URL, local storage or the
 * development preview selector.
 */
export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public marketing shell */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/get-started" element={<GetStartedPage />} />
          <Route path="/demo" element={<PortalPreviewPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* Sign-in / registration — signed-in visitors are sent to their portal */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register/patient" element={<PatientRegisterPage />} />
          <Route path="/register/doctor" element={<DoctorRegisterPage />} />
        </Route>

        {/* Pending doctor landing page — an unverified doctor may only see this */}
        <Route element={<ProtectedRoute allow="doctor" />}>
          <Route path="/doctor/pending-verification" element={<PendingVerificationPage />} />
        </Route>

        {/* Patient portal — authenticated patients only */}
        <Route element={<ProtectedRoute allow="patient" />}>
          <Route path="/patient" element={<PatientLayout />}>
            <Route index element={<Navigate to="/patient/dashboard" replace />} />
            <Route path="dashboard" element={<PatientDashboard />} />
            <Route path="records" element={<MedicalRecords />} />
            <Route path="requests" element={<DoctorAccessRequests />} />
            <Route path="consents" element={<ActiveConsents />} />
            <Route path="active-consents" element={<Navigate to="/patient/consents" replace />} />
            <Route path="consent-history" element={<ConsentHistory />} />
            <Route path="access-history" element={<PatientAccessHistory />} />
            <Route path="profile" element={<PatientProfile />} />
            <Route path="settings" element={<PatientSettings />} />
          </Route>
        </Route>

        {/* Doctor portal — administrator-verified, active doctors only */}
        <Route element={<ProtectedRoute allow="doctor" requireVerifiedDoctor />}>
          <Route path="/doctor" element={<DoctorLayout />}>
            <Route index element={<Navigate to="/doctor/dashboard" replace />} />
            <Route path="dashboard" element={<DoctorDashboard />} />
            <Route path="patients" element={<DoctorPatients />} />
            <Route path="request-records" element={<RequestMedicalRecords />} />
            <Route path="requests" element={<MyRequests />} />
            <Route path="accessible-records" element={<AccessibleRecords />} />
            <Route path="access-history" element={<DoctorAccessHistory />} />
            <Route path="profile" element={<DoctorProfile />} />
          </Route>
        </Route>

        {/* Administrator portal — authenticated administrators only */}
        <Route element={<ProtectedRoute allow="admin" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="patients" element={<ManagePatients />} />
            <Route path="verify-doctors" element={<VerifyDoctors />} />
            <Route path="users" element={<ManageUsers />} />
            <Route path="activity-logs" element={<ActivityLogs />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
