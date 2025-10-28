import { useEffect, useState } from 'react';
import { toast} from 'react-toastify';   

export default function Devices(){
    const [devices, setDevices] = useState([]);
    const [addDeviceModalOpen, setAddDeviceModalOpen] = useState(false);
    const [addDeviceError, setAddDeviceError] = useState(null);
    const [editModelOpen, setEditModalOpen] = useState(false);
    const [editDeviceData, setEditDeviceData] = useState(null);
    const [users, setUsers] = useState([]);

    const getUsers = async ()=>{
        const response = await fetch("http://localhost/users_data/users", {
            method: "GET",
            headers: {
                "Authorization": "Bearer "+localStorage.getItem("auth_token"),
                "X-User-Role": "admin"
            },
            credentials: "include"
        });
        const data = await response.json();
        setUsers(data.users);
    }


    useEffect(()=>{
        async function fetchDevices(){

            
            const response = await fetch("http://localhost/devices/devices", {
                method: "GET",
                headers: {
                    "Authorization": "Bearer "+localStorage.getItem("auth_token")
                },
                credentials: "include"
            });

            const data = await response.json();
            
            setDevices(data.devices);
        }

        fetchDevices();
        getUsers();
    }, []);

    const handleAddDevuce = async (e)=>{
        setAddDeviceError(null);
        e.preventDefault();

        const data = new FormData(e.target);

        const device = {
            name: data.get("name"),
            max_consumption: data.get("max_consumption"),
            image_url: data.get("image_url")
        };

        if (!device.name || !device.max_consumption) {
            setAddDeviceError("Name and Max Consumption are required");
            return;
        }

        const response = await fetch("http://localhost/devices/device", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer "+localStorage.getItem("auth_token")
            },
            credentials: "include",
            body: JSON.stringify(device)
        });

        if (response.ok) {
            const newDevice = await response.json();
            setDevices([...devices, {
                id: newDevice.deviceId,
                name: device.name,
                max_consumption: device.max_consumption,
                image_url: device.image_url,
                created_at: new Date().toISOString(),
                user_id: "N/A"
            }]);
            toast.success("Device added successfully");
            setAddDeviceModalOpen(false);
        } else {
            const errorData = await response.json();
            setAddDeviceError(errorData.error || "Failed to add device");
        }
    }

    const handleDelete = async (deviceId)=>{
        const response = await fetch(`http://localhost/devices/device/${deviceId}`, {
            method: "DELETE",
            headers: {
                "Authorization": "Bearer "+localStorage.getItem("auth_token")
            },
            credentials: "include"
        });
        if (response.ok) {
            setDevices(devices.filter(device=>device.id !== deviceId));
            toast.success("Device deleted successfully");
        } else {
            toast.error("Failed to delete device");
        }   
    }

    const handleEditDevice = async (e)=>{
        e.preventDefault();
        const data = new FormData(e.target);
        const updatedDevice = {
            name: data.get("name"),
            max_consumption: data.get("max_consumption"),
            image_url: data.get("image_url"),
            user_id: data.get("user_id") || null
        };

        const response = await fetch(`http://localhost/devices/device/${editDeviceData.id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer "+localStorage.getItem("auth_token")
            },
            credentials: "include",
            body: JSON.stringify(updatedDevice)
        });
        if (response.ok) {
            setDevices(devices.map(device=>{
                if (device.id === editDeviceData.id) {
                    return {
                        ...device,
                        ...updatedDevice
                    }
                }
                return device;
            }));    
            toast.success("Device updated successfully");
            setEditModalOpen(false);
        } else {
            toast.error("Failed to update device");
        }
    }

    return (
        <div className='p-4'>
            <div className="flex flex-row justify-between items-center">
                <h1 className='text-3xl font-bold mb-4'>Manage Devices</h1>
                <button onClick={()=>{
                    setAddDeviceModalOpen(true)
                }} className='bg-green-500 text-white cursor-pointer p-2 rounded-xl font-bold hover:bg-green-700 transition-all'>Add Device</button>
            </div>

            {
                addDeviceModalOpen && (
                    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center'>
                        <div className='bg-white p-6 rounded-xl w-96'>
                            <h2 className='text-2xl font-bold mb-4'>Add New Device</h2>
                            <form className='flex flex-col gap-4' onSubmit={handleAddDevuce}>
                                <input type="text" name="name" placeholder='Device Name' className='border border-gray-300 p-2 rounded-xl w-full'/>
                                <input type="number" name="max_consumption" placeholder='Max Consumption (W)' className='border border-gray-300 p-2 rounded-xl w-full'/>
                                <input type="text" name="image_url" placeholder='Image URL (optional)' className='border border-gray-300 p-2 rounded-xl w-full'/>
                                {
                                    addDeviceError && (
                                        <p className='text-red-500 font-bold'>{addDeviceError}</p>
                                    )
                                }
                                <div className='flex flex-row justify-end gap-2'>
                                    <button 
                                    type='button'
                                    onClick={()=>setAddDeviceModalOpen(false)}
                                    className='bg-gray-300 text-black px-4 py-2 rounded-xl font-bold hover:bg-gray-500 transition-all'>Cancel</button>
                                    <button type='submit' className='bg-blue-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all'>Add Device</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                editModelOpen && (
                    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center'>
                        <div className='bg-white p-6 rounded-xl w-96'>
                            <h2 className='text-2xl font-bold mb-4'>Edit Device</h2>
                            <form className='flex flex-col gap-4' onSubmit={handleEditDevice}>
                                <input type="text" name="name" placeholder='Device Name' className='border border-gray-300 p-2 rounded-xl w-full' defaultValue={editDeviceData?.name}/>
                                <input type="number" name="max_consumption" placeholder='Max Consumption (W)' className='border border-gray-300 p-2 rounded-xl w-full' defaultValue={editDeviceData?.max_consumption} />
                                <input type="text" name="image_url" placeholder='Image URL (optional)' onChange={(e)=>{
                                    setEditDeviceData({...editDeviceData, image_url: e.target.value});
                                }} className='border border-gray-300 p-2 rounded-xl w-full' defaultValue = {editDeviceData?.image_url} />   
                                <img src={editDeviceData?.image_url || "https://via.placeholder.com/100"} alt={editDeviceData?.name} className='w-24 h-24 object-cover rounded-xl mr-4'/>
                                {
                                    users.length > 0 && (
                                        <select 
                                        name='user_id'
                                        className='border border-gray-300 p-2 rounded-xl w-full' defaultValue={editDeviceData?.user_id || ""}>
                                            <option value="">No user assigned to</option>
                                            {
                                                users.map((user)=>{
                                                    return <option 
                                                    
                                                    key={user.user_id} value={user.user_id}>{user.name} (ID: {user.user_id})</option>
                                                })
                                            }
                                        </select>
                                    )
                                }
                                <div className='flex flex-row justify-end gap-2'>
                                    <button 
                                    type='button'
                                    onClick={()=>setEditModalOpen(false)}
                                    className='bg-gray-300 text-black px-4 py-2 rounded-xl font-bold hover:bg-gray-500 transition-all'>Cancel</button>
                                    <button type='submit' className='bg-blue-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all'>Save Changes</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            <div className="flex flex-col p-4 gap-4">
                {
                    devices.length === 0 ? (
                        <p>No devices found.</p>
                    ) : devices.map((device)=>{
                        return (
                            <div key={device.id} className='border border-gray-300 shadow-md rounded-lg p-4  flex flex-row justify-between items-center'>
                                <div>
                                    <img src={device.image_url || "https://via.placeholder.com/100"} alt={device.name} className='w-24 h-24 object-cover rounded-xl mr-4'/>
                                    <h2 className='text-xl font-bold'>{device.name}</h2>
                                    <p>Max Consumption: {device.max_consumption}W</p>
                                    <p>Created At: {new Date(device.created_at).toLocaleString()}</p>
                                    <p>User ID: {device.user_id}</p>
                                </div>
                                <div>
                                    <button 
                                    onClick={()=>{
                                        setEditDeviceData(device);
                                        setEditModalOpen(true);
                                    }}
                                    className='bg-blue-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all mr-2'>Edit</button>
                                    <button
                                    onClick={()=>{
                                        handleDelete(device.id)
                                    }}
                                    className='bg-red-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-red-700 transition-all'>Delete</button>
                                </div>
                            </div>
                        )
                    })
                }
            </div>
        </div>
    )
}
