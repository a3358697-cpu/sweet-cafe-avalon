import { GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut, type User } from "firebase/auth";
import { auth } from "./firebase";

/** 等 Firebase 還原登入狀態（第一次回呼）。 */
export function authReady(): Promise<User | null> {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (user) => {
      off();
      resolve(user);
    });
  });
}

/** 客人使用匿名登入，取得一個只屬於這個瀏覽器的身分，不需要註冊。 */
export async function ensureUser(): Promise<User> {
  const existing = await authReady();
  if (existing) return existing;
  return (await signInAnonymously(auth)).user;
}

export async function signInAsHost(): Promise<User> {
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}

export const logout = (): Promise<void> => signOut(auth);
