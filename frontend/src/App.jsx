import { NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from './context/AuthContext';
import { ToastContainer } from 'react-toastify';

const links = {
  "client": [
    { name: "Home", path: "/client" },
  ],
  "admin": [
    {
      name: "Admin Home",
      path: "/admin"
    },
    {
      name: "Manage Devices",
      path: "/admin/devices"
    },
    {
      name: "Manage Users",
      path: "/admin/users"
    }
  ]
}

function App() {

  const authData = useAuth();
  const navigate = useNavigate();

  const handleLogout = async ()=>{
    localStorage.removeItem("auth_token");
    navigate("/login");
  }


  return (
    <>
    <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover />
    <div className="grid grid-cols-[300px_1fr] gap-2 p-1 bg-gray-200 min-h-screen">
      <div className='bg-white rounded-xl flex flex-col justify-between p-1'>
        <ul className='flex-auto'>
          {
            links[authData.role]?.map((link)=>{
              return <li key={link.path} className='mb-2'>
                <NavLink to={link.path} end className={({isActive})=> isActive ? 'block p-2 bg-blue-500 text-white rounded-xl font-bold' : 'block p-2 hover:bg-blue-300 rounded-xl font-bold'}>
                  {link.name}
                </NavLink>
              </li>
            })
          }
        </ul>
        <button 
        onClick={handleLogout}
        className='w-full bg-red-300 p-2 rounded-xl cursor-pointer hover:bg-red-600 font-bold hover:text-white transition-all '>Logout</button>
      </div>
      <div className='bg-white rounded-xl'>
        <Outlet />
      </div>
    </div>
    </>
  )
}

export default App
