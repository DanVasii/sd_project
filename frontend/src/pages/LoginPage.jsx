import { useState } from "react";
import { useNavigate } from "react-router";

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [username, setUsername] = useState("admin2");
    const [password, setPassword] = useState("adminpass");
    const navigate = useNavigate();
    
    const handleLogin = async (e)=>{
        e.preventDefault();

        setLoading(true);
        const response = await fetch("http://localhost/auth_backend/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({username, password}),
            credentials: "include"
        });

        const data = await response.json();
        if (!response.ok) {
            setError(data.error || "Login failed");
        } else {
            setError(null); 
            localStorage.setItem("auth_token", data.user.token);
            navigate("/"+data.user.role);
        }

    }

    return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6">Login Page</h1>
            <form className="flex flex-col gap-4 w-80">
                <input
                    type="text"
                    placeholder="Username"
                    className="p-2 border border-gray-300 rounded"
                    value={username}
                    onChange={(e)=>{setUsername(e.target.value)}}
                />
                <input
                    type="password"
                    placeholder="Password"
                    className="p-2 border border-gray-300 rounded"
                    value={password}
                    onChange={(e)=>{setPassword(e.target.value)}}
                />
                <button
                    type="submit" 
                    className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
                    onClick={handleLogin}
                >
                    Login
                </button>
                <button
                    type="button" 
                    className="bg-green-500 text-white p-2 rounded hover:bg-green-600"
                    onClick={()=>{
                        setUsername("admin2");
                        setPassword("adminpass");
                    }}
                >
                    Fill Admin Credentials
                </button>
                <button 
                    type="button" 
                    className="bg-purple-500 text-white p-2 rounded hover:bg-purple-600"
                    onClick={()=>{
                        setUsername("testclient");
                        setPassword("clientpass");
                    }}
                >
                    Fill Client Credentials
                </button>
                {error &&
                <p className="text-red-500">{error}</p>
                    }
            </form>
        </div>
    )
}