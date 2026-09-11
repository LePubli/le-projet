import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock AuthContext pour éviter les appels API
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import Login from '../pages/Login'

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

describe('Login', () => {
  it('affiche le titre TriMaint', () => {
    renderLogin()
    expect(screen.getByText('TriMaint')).toBeInTheDocument()
  })

  it('affiche le champ nom d\'utilisateur', () => {
    renderLogin()
    expect(screen.getByText(/nom d'utilisateur/i)).toBeInTheDocument()
  })

  it('affiche le champ mot de passe', () => {
    renderLogin()
    expect(screen.getByText(/mot de passe/i)).toBeInTheDocument()
  })

  it('affiche le bouton de connexion', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument()
  })

  it('ne contient pas les identifiants par défaut (sécurité)', () => {
    const { container } = renderLogin()
    expect(container.textContent).not.toContain('admin123')
    expect(container.textContent).not.toMatch(/compte par défaut/i)
  })
})
