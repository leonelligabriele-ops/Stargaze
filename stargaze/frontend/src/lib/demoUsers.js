/**
 * Sample "other" stargazers to follow. There's no multi-user backend, so these
 * are mock profiles — enough to demo the Follow / Following flow end-to-end.
 */
export const DEMO_USERS = [
  {
    id: 'nova', name: 'Nova Quint', color: '#60a5fa',
    bio: 'Sci-fi devourer & midnight-movie curator.',
    movies: 412, followers: 1280, following: 312,
    genres: ['Science Fiction', 'Thriller', 'Mystery'],
  },
  {
    id: 'mira', name: 'Mira Sol', color: '#f472b6',
    bio: 'Slow cinema, world films and very long takes.',
    movies: 658, followers: 842, following: 197,
    genres: ['Drama', 'Romance', 'Documentary'],
  },
  {
    id: 'rex', name: 'Rex Calder', color: '#ef4444',
    bio: 'Action, westerns and anything that explodes.',
    movies: 530, followers: 2104, following: 88,
    genres: ['Action', 'Western', 'Adventure'],
  },
  {
    id: 'kai', name: 'Kai Mori', color: '#a78bfa',
    bio: 'Anime, horror and cult oddities after dark.',
    movies: 377, followers: 560, following: 433,
    genres: ['Animation', 'Horror', 'Fantasy'],
  },
]

export function getDemoUser(id) {
  return DEMO_USERS.find(u => u.id === String(id)) || null
}
