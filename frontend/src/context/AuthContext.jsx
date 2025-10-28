import { useEffect } from "react";
import { useContext } from "react";
import { createContext } from "react";
import { useState } from "react";
import { useNavigate, useNavigation } from "react-router";

const AuthContext = createContext();
const defaultValue = {
    role: "",
    user_id: -1,
    username: "",
    isLoading: true
};

export function AuthProvider({children}) {
    
    const [user, setUser] = useState(defaultValue);
    const navigate = useNavigate();

    useEffect(()=>{

        async function checkUser(){
            
            const response = await fetch("http://localhost/auth_backend/verify", {
                method: "GET",
                headers: {
                    "Authorization": "Bearer "+localStorage.getItem("auth_token")
                },
                credentials: "include"
            });

            if (response.ok) {
                const userId = response.headers.get("X-User-Id");
                const role = response.headers.get("X-User-Role");
                setUser({
                    role: role,
                    user_id: parseInt(userId),
                    username: "",
                    isLoading: false
                });
            } else {
                setUser({
                    role: "",
                    user_id: -1,
                    username: "",
                    isLoading: false
                });
                navigate("/login");
            }
        }

        checkUser();
        
    }, []);

    return <AuthContext.Provider value={user}>
        {
            user.isLoading ? <div>Loading...</div> : children
        }
    </AuthContext.Provider>
}

export function useAuth(){
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}