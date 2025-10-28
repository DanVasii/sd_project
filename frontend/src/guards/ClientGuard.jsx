import { useAuth } from "../context/AuthContext";

export default function ClientGuard({children}) {
    const authData = useAuth();

    if (authData.role !== "client") {
        return <div className="text-center text-red-500 font-bold p-4">
            Access Denied. You do not have permission to view this page.
        </div>
    }
    return children;
}