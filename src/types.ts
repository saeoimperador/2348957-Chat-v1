/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  lastSeen?: string;
}

export interface ChatMessage {
  id: string;
  text?: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  timestamp: any; // Firestore serverTimestamp
  channelId: string;
  type?: 'text' | 'image' | 'audio' | 'file';
  imageUrl?: string;
  audioUrl?: string;
  fileUrl?: string;
  replyToId?: string;
  replyToName?: string;
  replyToText?: string;
  bubbleColor?: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  createdAt: any;
  createdBy: string;
  isPrivate: boolean;
  allowedUsers: string[];
}

export interface JoinRequest {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  status: 'pending' | 'accepted' | 'declined';
  timestamp: any;
}
