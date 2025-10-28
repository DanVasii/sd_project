import { useEffect, useState } from "react"

export default function MyDevices() {   

    const [devices, setDevices] = useState([]); 
    
    useEffect(()=>{
        async function fetchMyDevices(){
            const response = await fetch("http://localhost/devices/my_devices", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + localStorage.getItem("auth_token")
                },
                credentials: "include"
            });

            const data = await response.json();
            setDevices(data.devices);

        }

        fetchMyDevices();
    }, [])

    return (
        <div className="p-4">
            <h1 className="text-3xl font-bold">My devices</h1>
            <div className="mt-4">
                {
                    devices.length === 0 ? (
                        <p>You have no devices.</p>
                    ) : (
                        <div className = "flex flex-col gap-2">
                            {
                                devices.map((device)=>{
                                    return <div key={device.id} className="shadow-lg border border-1 border-gray-200 p-4 rounded-xl flex items-center gap-4">
                                        <img src={device.image_url} alt={device.name} className="w-24 h-24 object-cover rounded-xl"/>
                                        <div>
                                            <h2 className="text-xl font-bold">{device.name}</h2>
                                            <p>Max Consumption: {device.max_consumption}W</p>
                                            <p>Added on: {new Date(device.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                })
                            }
                        </div>
                    )
                }
            </div>
        </div>
    )
}