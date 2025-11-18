import { useEffect, useState } from 'react';
import {toast} from 'react-toastify';

export default function Users() {

    const [showUserModal, setAddDeviceModalOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [editingUser, setEditingUser] = useState(null);

    useEffect(()=>{
        const fetchUsers = async ()=>{
            try {
                const res = await fetch("http://localhost/users_data/users", {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
                    },
                    credentials: "include"
                });
                if (res.ok) {
                    const data = await res.json();
                    setUsers(data.users);
                } else {
                    console.error("Failed to fetch users");
                }
            } catch (err) {
                console.error("Error fetching users:", err);
            }
        };

        fetchUsers();
    }, []);

    const handleAddUser = async (e)=>{
        e.preventDefault();
        const data = new FormData(e.target);
        const newUser = {
            name: data.get("name"),
            email: data.get("email"),
            avatar_url: data.get("avatar_url"),
            role: data.get("role"),
            username: data.get("username"),
            password: data.get("password"),
        };

        if (editingUser) {
            // LOGICA UPDATE: UN SINGUR APEL PUT SPRE AUTH (Publisher)
            
            // Combină toate datele (credentials + profile) într-un singur payload
            let combinedData = {
                username: newUser.username,
                role: newUser.role,
                name: newUser.name, 
                email: newUser.email, 
                avatar_url: newUser.avatar_url, 
            };
            
            if (newUser.password && newUser.password.trim() !== "") {
                combinedData.password = newUser.password;
            }

            // 1. Apel unic de UPDATE către Auth Service (Publisher)
            try {
                const res = await fetch(`http://localhost/auth_backend/user/${editingUser.user_id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
                    },
                    body: JSON.stringify(combinedData),
                    credentials: "include"
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    toast.error(errorData.error || "Failed to update user");
                    return;
                }

                toast.success("User update initiated successfully ");

                setUsers(users.map((user)=> user.user_id === editingUser.user_id ? {
                    ...user,
                    name: newUser.name, 
                } : user));
                
                setAddDeviceModalOpen(false);
                setEditingUser(null);
                
            } catch (err) {
                console.error("Error updating user:", err);
                toast.error("An error occurred during user update.");
                return;
            }
        
        } else {
            try {
                const res = await fetch("http://localhost/auth_backend/register", { 
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
                    },
                    body: JSON.stringify({
                        username: newUser.username,
                        password: newUser.password,
                        role: newUser.role,
                        name: newUser.name, 
                        email: newUser.email,
                        avatar_url: newUser.avatar_url
                    }),
                    credentials: "include"
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    toast.error(errorData.error || "Failed to create user in auth service");
                    return;
                }
                
                const resData = await res.json();
                const userId = resData.id;

                toast.success("User created successfully ");
                
                setUsers([...users, {
                    user_id: userId,
                    name: newUser.name, 
                    created_at: new Date().toISOString()
                }]);
                setAddDeviceModalOpen(false);

            } catch (err) {
                console.error("Error creating user:", err);
                toast.error("Error creating user in auth service");
                return;
            }
        }

    }

    const handleDelete = async (userId)=>{
        if (!window.confirm("Are you sure you want to delete this user?")) {
            return;
        }
        try {
            const res = await fetch(`http://localhost/auth_backend/user/${userId}`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
                },
                credentials: "include"
            });
            if (res.ok) {
                // SUCES: Ne bazăm pe mesajul USER_DELETED publicat de Auth
                setUsers(users.filter((user)=> user.user_id !== userId));
                toast.success("User deletion initiated successfully ");
            }
            else {
                console.error("Failed to delete user");
                toast.error("Failed to delete user");
            }
        } catch (err) {
            console.error("Error deleting user:", err);
            toast.error("Error deleting user");
        }   
    }

    const handleEditUser = async (user_id)=>{
        try {
            const res = await fetch(`http://localhost/auth_backend/user/${user_id}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
                },
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setEditingUser({
                    user_id,
                    username: data.user.username,
                    role: data.user.role
                });

                //parse details from users_data service
                try {
                    const res2 = await fetch(`http://localhost/users_data/user/${user_id}`, {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
                        },
                        credentials: "include"
                    });
                    if (res2.ok) {
                        const data2 = await res2.json();
                        setEditingUser((prev)=> ({
                            ...prev,
                            name: data2.user.name,
                            email: data2.user.email,
                            avatar_url: data2.user.avatar_url
                        }));
                        setAddDeviceModalOpen(true);
                    } else {
                        console.error("Failed to fetch user details from users data service");
                        toast.error("Failed to fetch user details from users data service");
                    }
                } catch (err) {
                    console.error("Error fetching user details from users data service:", err);
                    toast.error("Error fetching user details from users data service");
                }
            } else {
                console.error("Failed to fetch user credentials from auth service");
                toast.error("Failed to fetch user credentials from auth service");
            }
        } catch (err) {
            console.error("Error fetching user credentials from auth service:", err);
            toast.error("Error fetching user credentials from auth service");
        }
    
    }

    return (
    <div className='p-4'>
        <div className="flex flex-row justify-between items-center">
            <h1 className='text-3xl font-bold mb-4'>Manage users</h1>
            <button onClick={()=>{
                setAddDeviceModalOpen(true)
            }} className='bg-green-500 text-white cursor-pointer p-2 rounded-xl font-bold hover:bg-green-700 transition-all'>Add user</button>
        </div>

        {
            showUserModal && <div className='fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center'>
                <div className='bg-white p-4 rounded-xl w-96'>
                    <h2 className='text-2xl font-bold mb-4'>{
                        editingUser ? "Edit User" : "Add User"    
                    }</h2>
                    <form onSubmit={handleAddUser}>
                        <div className='mb-4'>
                            <label className='block mb-2 font-bold'>Name</label>
                            <input type="text" name="name" className='w-full border border-gray-300 p-2 rounded-xl'  defaultValue={editingUser?.name}/>
                        </div>
                        <div className='mb-4'>
                            <label className='block mb-2 font-bold'>Email</label>
                            <input type="email" name="email" className='w-full border border-gray-300 p-2 rounded-xl' defaultValue={editingUser?.email} />
                        </div>

                        <div className='mb-4'>
                            <label className='block mb-2 font-bold'>Avatar URL</label>
                            <input type="text" name="avatar_url" className='w-full border border-gray-300 p-2 rounded-xl' defaultValue={editingUser?.avatar_url} />
                        </div>

                        <div className='mb-4'>
                            <label className='block mb-2 font-bold'>Role</label>
                            <select name='role' className='w-full border border-gray-300 p-2 rounded-xl' defaultValue={editingUser?.role || ""}>
                                <option value="client">Client</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>

                        <div className='mb-4'>
                            <label className='block mb-2 font-bold'>Username</label>
                            <input name='username' type="text" className='w-full border border-gray-300 p-2 rounded-xl' defaultValue={editingUser?.username} />
                        </div>

                        <div className='mb-4'>
                            <label className='block mb-2 font-bold'>Password</label>
                            <input name='password' type="password" className='w-full border border-gray-300 p-2 rounded-xl' />
                        </div>
                        <div className='flex justify-end'>
                            <button type='button' onClick={()=>{
                                setAddDeviceModalOpen(false)
                                setEditingUser(null);
                            }} className='bg-gray-300 text-black p-2 rounded-xl font-bold hover:bg-gray-500 transition-all mr-2'>Cancel</button>
                            <button type='submit' className='bg-blue-500 text-white p-2 rounded-xl font-bold hover:bg-blue-700 transition-all'>
                                {editingUser ? "Update User" : "Add User"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        }

        <table className='w-full table-auto border-collapse border border-gray-300'>
            <thead>
                <tr className='bg-gray-200'>
                    <th className='border border-gray-300 p-2 text-left'>User ID</th>
                    <th className='border border-gray-300 p-2 text-left'>Name</th>
                    <th className='border border-gray-300 p-2 text-left'>Created At</th>
                    <th className='border border-gray-300 p-2 text-left'>Actions</th>
                </tr>
            </thead>
            <tbody>
                {users.map((user)=>{
                    return <tr key={user.user_id} className='hover:bg-gray-100'>
                        <td className='border border-gray-300 p-2'>{user.user_id}</td>
                        <td className='border border-gray-300 p-2'>{user.name}</td>
                        <td className='border border-gray-300 p-2'>{new Date(user.created_at).toLocaleString()}</td>
                        <td className='border border-gray-300 p-2'>
                            <button 
                            onClick={()=>{
                                handleEditUser(user.user_id)
                            }}
                            className='bg-blue-500 text-white p-1 px-4 rounded-xl font-bold hover:bg-blue-700 transition-all mr-2'>Edit</button>
                            <button
                            onClick={()=>{
                                handleDelete(user.user_id)
                            }}
                            className='bg-red-500 text-white p-1 px-4 rounded-xl font-bold hover:bg-red-700 transition-all'>Delete</button>
                        </td>
                    </tr>
                })}
            </tbody>
        </table>

        
    </div>
    )
}