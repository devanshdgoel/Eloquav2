import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

/**
 * Write the user's profile to Firestore under users/{uid}.
 *
 * Uses merge:true so partial updates (e.g. updating age later) never
 * overwrite fields that were not passed in. Email is pulled from the
 * authenticated Firebase user rather than trusted to the caller.
 *
 * Firestore document shape:
 *   name       string  — preferred name / nickname
 *   email      string  — from Firebase Auth
 *   age        string  — age range selected during onboarding (e.g. "25–34")
 *   phone      string  — phone number, may be empty string if not provided
 *   updatedAt  timestamp
 */
export async function saveUserProfileToFirestore({ name, age, phone = '' }) {
  const user = auth.currentUser;
  if (!user) return;

  await setDoc(
    doc(db, 'users', user.uid),
    {
      name,
      email: user.email || '',
      age,
      phone,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
