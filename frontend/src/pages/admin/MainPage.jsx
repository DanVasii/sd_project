import { useEffect, useState } from "react"
import {toast} from "react-toastify";

export default function MainPage(){

    const [numUsers, setNumUsers] = useState(0);
    const [numDevices, setNumDevices] = useState(0);

    useEffect(()=>{

        async function fetchUsers(){
            try{
                const response = await fetch("http://localhost/users_data/users", {
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem("auth_token")}`
                    },
                    credentials: "include"
                });

                if(!response.ok){
                    toast.error("Failed to fetch users");
                }
                const data = await response.json();
                setNumUsers(data.users.length);
            }catch(err){
                console.error(err);
                toast.error("An error occurred while fetching users");
            }
        }
        fetchUsers();

        async function fetchDevices(){  
            try{
                const response = await fetch("http://localhost/devices/devices", {
                    headers: {
                        "Authorization": `Bearer ${localStorage.getItem("auth_token")}`
                    },
                    credentials: "include"
                });
                if(!response.ok){
                    toast.error("Failed to fetch devices");
                }
                const data = await response.json();
                setNumDevices(data.devices.length);
            }catch(err){
                console.error(err);
                toast.error("An error occurred while fetching devices");
            }
        }
        fetchDevices();

    }, []);

    return(
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Admin Main Page</h1>
            <div className="flex flex-row gap-4">
                <div className="bg-blue-100 p-4 rounded-xl shadow-md w-64">
                    <h2 className="text-xl font-bold mb-2">Total Users</h2>
                    <p className="text-3xl font-bold">{numUsers}</p>
                </div>
                <div className="bg-green-100 p-4 rounded-xl shadow-md w-64">
                    <h2 className="text-xl font-bold mb-2">Total Devices</h2>
                    <p className="text-3xl font-bold">{numDevices}</p>
                </div>
            </div>
        </div>
    )
}