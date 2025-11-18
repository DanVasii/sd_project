import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function MyDevices() {   

    const [devices, setDevices] = useState([]); 
    const [selectedDevice, setSelectedDevice] = useState(null);

    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10)); 
    const [historicalData, setHistoricalData] = useState([]);
    
    const formatChartData = (data) => {
        const aggregated = data.reduce((acc, item) => {
            const hour = new Date(item.timestamp).getHours();
            acc[hour] = parseFloat(item.energy_consumed); 
            return acc;
        }, {});

        const chartData = [];
        for (let h = 0; h < 24; h++) {
            chartData.push({
                hour: `${h}:00`,
                'Consum (kWh)': aggregated[h] || 0, 
            });
        }
        return chartData;
    };


    useEffect(() => {
        async function fetchMyDevices() {
            try {
                const response = await fetch("http://localhost/devices/my_devices", {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + localStorage.getItem("auth_token")
                    },
                    credentials: "include"
                });

                if (!response.ok) {
                    toast.error("Failed to fetch devices.");
                    return;
                }

                const data = await response.json();
                setDevices(data.devices);
                
                // Setează primul dispozitiv ca implicit, dacă există
                if (data.devices.length > 0) {
                    setSelectedDevice(data.devices[0].id);
                }
            } catch (error) {
                console.error("Error fetching devices:", error);
                toast.error("An error occurred while fetching devices.");
            }
        }
        fetchMyDevices();
    }, []);

    useEffect(() => {
        if (!selectedDevice || !selectedDate) return;

        async function fetchHistoricalConsumption() {
            const token = localStorage.getItem("auth_token");
            try {
                const url = `http://localhost/monitoring/historical_consumption/${selectedDevice}/${selectedDate}`;
                
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + token
                    },
                    credentials: "include"
                });

                if (!response.ok) {
                    toast.error("Failed to fetch historical consumption.");
                    setHistoricalData([]);
                    return;
                }

                const data = await response.json();
                
                const formattedData = formatChartData(data.consumption);
                setHistoricalData(formattedData);

            } catch (error) {
                console.error("Error fetching historical data:", error);
                toast.error("An error occurred while fetching historical data.");
                setHistoricalData([]);
            }
        }
        fetchHistoricalConsumption();
        
    }, [selectedDevice, selectedDate]);


    return (
        <div className="p-4">
            <h1 className="text-3xl font-bold mb-4">My Devices & Consumption</h1>
            
            <div className="flex flex-row gap-4 mb-6 items-end">
                <div>
                    <label className="block mb-1 font-semibold">Selectează Dispozitivul:</label>
                    <select 
                        className="p-2 border border-gray-300 rounded-lg"
                        value={selectedDevice || ''} 
                        onChange={(e) => setSelectedDevice(parseInt(e.target.value))}
                        disabled={devices.length === 0}
                    >
                        {devices.length === 0 ? (
                            <option value="">No devices assigned</option>
                        ) : (
                            devices.map((device) => (
                                <option key={device.id} value={device.id}>
                                    {device.name} (ID: {device.id})
                                </option>
                            ))
                        )}
                    </select>
                </div>

                <div>
                    <label className="block mb-1 font-semibold">Selectează Data:</label>
                    <input 
                        type="date" 
                        className="p-2 border border-gray-300 rounded-lg"
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)} 
                    />
                </div>
            </div>

            {selectedDevice && (
                <div className="mt-4 p-4 border rounded-xl shadow-lg">
                    <h2 className="text-xl font-bold mb-4">
                        Consum Orar (kWh) pentru {devices.find(d => d.id === selectedDevice)?.name} - {selectedDate}
                    </h2>
                    
                    {historicalData.length > 0 && (
                        <ResponsiveContainer width="100%" height={400}>
                            <BarChart data={historicalData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hour" label={{ value: 'Ora din Zi', position: 'bottom' }} /> 
                                <YAxis label={{ value: 'Consum (kWh)', angle: -90, position: 'left' }} /> 
                                <Tooltip formatter={(value) => [`${value} kWh`, 'Consum Orar']} />
                                <Legend />
                                <Bar dataKey="Consum (kWh)" fill="#8884d8" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    
                    {historicalData.length === 0 && (
                        <p className="text-center text-gray-500 p-10">
                            Nu s-au găsit date de consum pentru ziua selectată.
                        </p>
                    )}
                </div>
            )}
            
            <div className="mt-8">
                <h2 className="text-xl font-bold mb-4">Dispozitive Alocate </h2>
                {devices.length === 0 ? (
                    <p className="text-gray-500">Nu aveți dispozitive alocate.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {devices.map((device) => (
                            <div key={device.id} className="shadow-lg border border-1 border-gray-200 p-4 rounded-xl flex items-center gap-4">
                                <img src={device.image_url || "https://via.placeholder.com/100"} alt={device.name} className="w-24 h-24 object-cover rounded-xl"/>
                                <div>
                                    <h3 className="text-xl font-bold">{device.name}</h3>
                                    <p>Consum Maxim: {device.max_consumption}W</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}