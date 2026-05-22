import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db, loginWithGoogle, logoutUser, handleFirestoreError, OperationType } from "../lib/firebase";
import { UserProfile, UserRole } from "../types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<User>;
  loginWithEmail: (email: string, password: string, isSignUp: boolean) => Promise<User>;
  signUpUser: (name: string, email: string, password: string, role: UserRole, squad: string) => Promise<User>;
  loginAsGuest: (name: string, squad: string, warRoomName: string) => Promise<string>;
  adminCreateUser: (name: string, email: string, password: string, role: UserRole, squad: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  createProfile: (name: string, role: UserRole, squad: string) => Promise<void>;
  updateProfile: (profileData: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, "users", currentUser.uid);
          const userSnap = await getDoc(userDocRef);
          
          if (userSnap.exists()) {
            setProfile(userSnap.data() as UserProfile);
          } else {
            setProfile(null); // Triggers onboarding in UI
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setLoading(true);
    try {
      const u = await loginWithGoogle();
      return u;
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, password: string, isSignUp: boolean): Promise<User> => {
    setLoading(true);
    try {
      if (isSignUp) {
        const credentials = await createUserWithEmailAndPassword(auth, email, password);
        return credentials.user;
      } else {
        const credentials = await signInWithEmailAndPassword(auth, email, password);
        return credentials.user;
      }
    } finally {
      setLoading(false);
    }
  };

  const signUpUser = async (name: string, email: string, password: string, role: UserRole, squad: string): Promise<User> => {
    setLoading(true);
    try {
      const credentials = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const newUser = credentials.user;

      const newUserProfile: UserProfile = {
        id: newUser.uid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        squad: squad.trim(),
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", newUser.uid), newUserProfile);
      setProfile(newUserProfile);
      return newUser;
    } finally {
      setLoading(false);
    }
  };

  const loginAsGuest = async (name: string, squad: string, warRoomName: string): Promise<string> => {
    setLoading(true);
    let guestUser: User | null = null;
    const tempEmail = `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}@guest.forceqa.com`;
    const tempPassword = `guestPass_${Math.floor(Math.random() * 900000) + 100000}`;

    try {
      // 1. Sign up/In the guest using a dynamically generated email and password
      const credentials = await createUserWithEmailAndPassword(auth, tempEmail, tempPassword);
      guestUser = credentials.user;

      // 2. Now authenticated, verify if war room exists (either by ID or by Name)
      let roomDocData: any = null;
      let roomId = "";

      const directDocRef = doc(db, "warRooms", warRoomName.trim());
      const directDocSnap = await getDoc(directDocRef);

      if (directDocSnap.exists()) {
        roomDocData = directDocSnap.data();
        roomId = directDocSnap.id;
      } else {
        // Look up by name
        let roomsSnap = await getDocs(query(collection(db, "warRooms"), where("name", "==", warRoomName.trim())));
        let foundDoc = roomsSnap.docs[0];
        if (!foundDoc) {
          // Fallback case-insensitive check
          const allRoomsSnap = await getDocs(collection(db, "warRooms"));
          foundDoc = allRoomsSnap.docs.find(
            (d) => d.data().name?.trim().toLowerCase() === warRoomName.trim().toLowerCase()
          ) as any;
        }

        if (foundDoc) {
          roomDocData = foundDoc.data();
          roomId = foundDoc.id;
        }
      }

      if (!roomId || !roomDocData) {
        // Sign out and try to clean up if room doesn't exist
        try {
          await guestUser.delete();
        } catch (delErr) {
          console.error("Error deleting temp user:", delErr);
          await auth.signOut();
        }
        throw new Error("A sala de guerra informada não existe ou o ID é inválido. Verifique se o ID/Nome está correto.");
      }

      // Check if guest access is disabled
      if (roomDocData.guestAccessDisabled === true) {
        try {
          await guestUser.delete();
        } catch (delErr) {
          console.error("Error deleting temp user:", delErr);
          await auth.signOut();
        }
        throw new Error("O acesso de convidados (Guest) para esta Sala de Guerra foi desativado pelo administrador.");
      }

      // 3. Create Profile
      const guestProfile: UserProfile = {
        id: guestUser.uid,
        name: name.trim(),
        email: tempEmail,
        role: "viewer", // Assign viewer role for guests
        squad: squad.trim(),
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", guestUser.uid), guestProfile);
      setProfile(guestProfile);

      return roomId;
    } catch (error) {
      console.error("Error in guest login:", error);
      if (auth.currentUser && guestUser) {
        try {
          await guestUser.delete();
        } catch (delErr) {
          await auth.signOut();
        }
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const adminCreateUser = async (name: string, email: string, password: string, role: UserRole, squad: string) => {
    const { initializeApp, deleteApp } = await import("firebase/app");
    const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth");
    const firebaseConfig = (await import("../../firebase-applet-config.json")).default;

    const appName = "SecondaryCreator_" + Date.now();
    const secondaryApp = initializeApp(firebaseConfig, appName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const result = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
      const newUserId = result.user.uid;

      const newProfile: UserProfile = {
        id: newUserId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        squad: squad.trim(),
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", newUserId), newProfile);
    } finally {
      await deleteApp(secondaryApp);
    }
  };

  const changePassword = async (newPassword: string) => {
    if (!auth.currentUser) throw new Error("Nenhum usuário está atualmente logado.");
    const { updatePassword } = await import("firebase/auth");
    await updatePassword(auth.currentUser, newPassword);
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutUser();
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async (name: string, role: UserRole, squad: string) => {
    if (!user) throw new Error("No authenticated user active.");
    const path = `users/${user.uid}`;
    try {
      const newProfile: UserProfile = {
        id: user.uid,
        name,
        email: user.email || "",
        role,
        squad,
        createdAt: new Date().toISOString()
      };

      if (user.photoURL) {
        newProfile.avatarUrl = user.photoURL;
      }

      await setDoc(doc(db, "users", user.uid), newProfile);
      setProfile(newProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const updateProfile = async (profileData: Partial<UserProfile>) => {
    if (!user || !profile) throw new Error("No profile active to update.");
    const path = `users/${user.uid}`;
    try {
      const updated = {
        ...profile,
        ...profileData,
        id: user.uid, // Protect ID
        email: profile.email // Protect Email
      };
      await setDoc(doc(db, "users", user.uid), updated);
      setProfile(updated);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, loginWithEmail, signUpUser, loginAsGuest, adminCreateUser, changePassword, logout, createProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
