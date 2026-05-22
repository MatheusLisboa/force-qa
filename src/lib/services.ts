import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  addDoc,
  deleteDoc,
  serverTimestamp, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { WarRoom, Bug, BugComment, ActivityLog, AISuggestion, AIDuplicateCheck, AIWarRoomSummary, SeverityLevel, BugStatus, BugPriority, BugType } from "../types";

// -------------------------
// 1. WarRoom Operations
// -------------------------
export async function createWarRoom(data: Omit<WarRoom, "id" | "createdAt">): Promise<string> {
  const customId = "room-" + Math.random().toString(36).substring(2, 11).toUpperCase();
  const path = `warRooms/${customId}`;
  try {
    const newRoom: WarRoom = {
      ...data,
      id: customId,
      createdAt: new Date().toISOString(),
      guestAccessDisabled: false
    };
    await setDoc(doc(db, "warRooms", customId), newRoom);
    return customId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateWarRoomStatus(roomId: string, status: "active" | "ended" | "paused"): Promise<void> {
  const path = `warRooms/${roomId}`;
  try {
    await updateDoc(doc(db, "warRooms", roomId), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// -------------------------
// 2. Bug Tracker Operations
// -------------------------
export async function createBug(
  data: Omit<Bug, "id" | "createdAt" | "updatedAt">,
  userId: string,
  userName: string
): Promise<string> {
  const customId = "bug-" + Math.random().toString(36).substring(2, 11).toUpperCase();
  const path = `bugs/${customId}`;
  try {
    const now = new Date().toISOString();
    const newBug: Bug = {
      ...data,
      id: customId,
      createdAt: now,
      updatedAt: now,
      reopenCount: 0
    };
    await setDoc(doc(db, "bugs", customId), newBug);

    // Initialise Activity Log
    await createActivityLog({
      bugId: customId,
      warRoomId: data.warRoomId,
      userId,
      userName,
      type: "creation",
      description: `Registrou o bug "${data.title}" com criticidade [${data.criticism.toUpperCase()}]`
    });

    return customId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBugField(
  bugId: string, 
  warRoomId: string,
  fields: Partial<Bug>,
  userId: string,
  userName: string,
  logDescription: string
): Promise<void> {
  const path = `bugs/${bugId}`;
  try {
    const now = new Date().toISOString();
    const updatePayload: any = {
      ...fields,
      updatedAt: now
    };

    if (fields.status === "validated") {
      updatePayload.resolvedAt = now;
    }

    await updateDoc(doc(db, "bugs", bugId), updatePayload);

    // Log the change
    await createActivityLog({
      bugId,
      warRoomId,
      userId,
      userName,
      type: "update",
      description: logDescription
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// -------------------------
// 3. Comments Operations
// -------------------------
export async function createComment(
  commentData: Omit<BugComment, "id" | "createdAt">,
  userName: string
): Promise<void> {
  const commentId = "com-" + Math.random().toString(36).substring(2, 11).toUpperCase();
  const path = `bugs/${commentData.bugId}/comments/${commentId}`;
  try {
    const payload: BugComment = {
      ...commentData,
      id: commentId,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, "bugs", commentData.bugId, "comments", commentId), payload);

    // Log that comment was added
    await createActivityLog({
      bugId: commentData.bugId,
      warRoomId: commentData.warRoomId,
      userId: commentData.userId,
      userName,
      type: "comment",
      description: `Adicionou um comentário: "${commentData.text.length > 30 ? commentData.text.substring(0, 30) + "..." : commentData.text}"`
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// -------------------------
// 4. Activity Logs Operations
// -------------------------
export async function createActivityLog(logData: Omit<ActivityLog, "id" | "createdAt">): Promise<void> {
  const logId = "log-" + Math.random().toString(36).substring(2, 11).toUpperCase();
  const path = `bugs/${logData.bugId}/activityLogs/${logId}`;
  try {
    const payload: ActivityLog = {
      ...logData,
      id: logId,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, "bugs", logData.bugId, "activityLogs", logId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// -------------------------
// 5. User Profile Fetching List
// -------------------------
export async function fetchUsersList(): Promise<any[]> {
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => d.data());
  } catch (error) {
    console.error("Error fetching user lists:", error);
    return [];
  }
}

// -------------------------
// 6. Server-Side AI Integrations Proxy Calls
// -------------------------
export async function fetchAISuggestions(title: string, description: string): Promise<AISuggestion> {
  const response = await fetch("/api/ai/suggest-bug-fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch AI suggests.");
  }
  return response.json();
}

export async function fetchAIDuplicateCheck(
  title: string, 
  description: string, 
  existingBugs: Partial<Bug>[]
): Promise<AIDuplicateCheck> {
  const response = await fetch("/api/ai/detect-duplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, existingBugs }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch Duplication checks.");
  }
  return response.json();
}

export async function fetchAIWarRoomSummary(warRoom: WarRoom, bugs: Bug[]): Promise<AIWarRoomSummary> {
  const response = await fetch("/api/ai/summarize-warroom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ warRoom, bugs }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to fetch War Room summary report.");
  }
  return response.json();
}
