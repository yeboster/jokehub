
export interface Joke {
  id: string;
  text: string;
  category: string; // Stores the category name
  source?: string; // Optional field for the joke's source
  dateAdded: Date;
  used: boolean;
  funnyRate: number; // 0 for unrated, 1-5 for rating
  userId: string; // Added to associate joke with a user
  averageRating?: number;
  ratingCount?: number;
  ratingSum?: number;
  explanation?: string;
  keywords?: string[];
}

export interface Category {
  id: string;
  name: string;
  userId: string;
  // Optionally, add createdAt: Date; if needed
}

export interface UserRating {
  id: string; // Firestore document ID
  jokeId: string; // ID of the joke being rated
  userId: string; // ID of the user who made the rating
  stars: number; // Numerical rating, e.g., 1-5
  comment?: string; // Optional text comment
  createdAt: Date; // Timestamp of when the rating was first created
  updatedAt: Date; // Timestamp of when the rating was last updated
}

    
