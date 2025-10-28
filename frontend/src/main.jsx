import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AuthProvider } from './context/AuthContext';
import LoginPage from './pages/LoginPage.jsx';
import ClientGuard from './guards/ClientGuard.jsx';
import AdminGuard from './guards/AdminGuard';
import MyDevices from './pages/client/MyDevices.jsx';
import Devices from './pages/admin/Devices.jsx';
import Users from './pages/admin/Users.jsx';
import MainPage from './pages/admin/MainPage.jsx';


const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/",
    element: <AuthProvider>
      <App />
    </AuthProvider>,
    children: [
      {
        path: "/client",
        children: [
          {
            path: "",
            index: true,
            element: <ClientGuard>
              <MyDevices />
            </ClientGuard>
          }
        ]
      },
      {
        path: "/admin",
        children: [
          {
            path: "",
            index: true,
            element: <AdminGuard>
              <MainPage />
            </AdminGuard>
          },
          {
            path: "devices",
            element: <AdminGuard>
              <Devices>

              </Devices>
            </AdminGuard>
          },
          {
            path: "users",
            element: <AdminGuard>
              <Users />
            </AdminGuard>
          }
        ]
      }
    ]
  }
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
