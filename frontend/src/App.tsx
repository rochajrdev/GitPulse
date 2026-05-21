import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  Layers, 
  Copy, 
  Check, 
  Flame, 
  Calendar, 
  RefreshCw, 
  Mail, 
  Award, 
  TrendingUp,
  Menu,
  Settings,
  Plus,
  Trash2,
  User
} from 'lucide-react';
import CommitLineChart from './components/CommitLineChart';

// ==========================================
// INTERFACES
// ==========================================
interface User {
  username: string;
  name: string;
  webhookToken: string;
  emailAliases: string[];
}

interface Stats {
  totalCommits: number;
  currentStreak: number;
  longestStreak: number;
  activeDaysCount: number;
  mostActivePlatform: string;
  platformBreakdown: Record<string, number>;
}

interface DailyCommit {
  total: number;
  github: number;
  gitlab: number;
  bitbucket: number;
  codeberg: number;
  local: number;
}

interface Summary {
  user: User;
  stats: Stats;
  dailyCommits: Record<string, DailyCommit>;
  years: number[];
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'integrations' | 'settings'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [userData, setUserData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'last-year'>('last-year');
  const [toast, setToast] = useState<Toast | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSyncingCards, setIsSyncingCards] = useState(false);

  // Filtros de Plataforma
  const [platformFilters, setPlatformFilters] = useState({
    github: true,
    gitlab: true,
    bitbucket: true,
    codeberg: true,
    local: true,
  });

  // Estado para Guia de Integração
  const [activeIntTab, setActiveIntTab] = useState<'github' | 'gitlab' | 'bitbucket' | 'codeberg' | 'local'>('github');

  // Referência do Tooltip Portal
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    dateStr: string;
    commits: DailyCommit | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    dateStr: '',
    commits: null,
  });

  const backendUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
  const [username, setUsername] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const queryUser = params.get('username');
    if (queryUser) {
      localStorage.setItem('gitpulse_username', queryUser);
      return queryUser;
    }
    return localStorage.getItem('gitpulse_username') || '';
  });

  // ==========================================
  // CARREGAR DADOS DO BACKEND
  // ==========================================
  const fetchSummary = async (showNotification = false) => {
    try {
      setLoading(true);
      setError(null);

      let activeUser = username;
      if (!activeUser) {
        // Busca a lista de usuários cadastrados no banco
        const usersRes = await fetch(`${backendUrl}/api/v1/users`);
        if (usersRes.ok) {
          const users = await usersRes.json();
          if (Array.isArray(users) && users.length > 0) {
            activeUser = users[0].username;
            localStorage.setItem('gitpulse_username', activeUser);
            setUsername(activeUser);
          }
        }
      }

      if (!activeUser) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${backendUrl}/api/v1/users/${activeUser}/summary?year=${selectedYear}&t=${Date.now()}`);
      if (!response.ok) {
        throw new Error('Falha ao carregar o resumo de contribuições');
      }
      const data = await response.json();
      setUserData(data);
      if (showNotification) {
        showToast('Dados atualizados com sucesso!', 'success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de conexão');
      showToast('Não foi possível conectar ao backend local.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // GERENCIAMENTO DE E-MAILS ALIASES
  // ==========================================
  const handleAddEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !userData) return;

    try {
      setIsAddingEmail(true);
      const response = await fetch(`${backendUrl}/api/v1/users/${username}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: newEmail.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao adicionar e-mail');
      }

      showToast('E-mail alias cadastrado com sucesso!', 'success');
      setNewEmail('');
      await fetchSummary(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Falha ao adicionar e-mail', 'error');
    } finally {
      setIsAddingEmail(false);
    }
  };

  const handleDeleteEmail = async (emailToDelete: string) => {
    if (!userData) return;

    if (userData.user.emailAliases.length <= 1) {
      showToast('Não é possível remover o único e-mail cadastrado.', 'error');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja remover o e-mail "${emailToDelete}"?`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${backendUrl}/api/v1/users/${username}/emails?email=${encodeURIComponent(emailToDelete)}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao remover e-mail');
      }

      showToast('E-mail removido com sucesso!', 'success');
      await fetchSummary(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Falha ao remover e-mail', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !userData) return;

    try {
      setIsSavingProfile(true);
      const response = await fetch(`${backendUrl}/api/v1/users/${username}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: profileName.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar perfil');
      }

      showToast('Nome do perfil atualizado com sucesso!', 'success');
      await fetchSummary(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Falha ao salvar perfil', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };


  const handleSyncCards = async () => {
    if (isSyncingCards) return;
    try {
      setIsSyncingCards(true);
      setError(null);
      showToast('Sincronizando métricas dos cards com o GitHub...', 'info');
      
      const response = await fetch(`${backendUrl}/api/v1/users/${username}/sync`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Falha ao sincronizar dados dos cards');
      }
      
      await fetchSummary(false);
      showToast('Métricas dos cards sincronizadas com sucesso!', 'success');
    } catch (err) {
      try {
        await fetchSummary(false);
      } catch (_) {}
      showToast('Erro ao sincronizar cards. Usando dados locais.', 'error');
    } finally {
      setIsSyncingCards(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [selectedYear, username]);

  useEffect(() => {
    if (userData?.user.name) {
      setProfileName(userData.user.name);
    }
  }, [userData?.user.name]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );
      
      if (isInput) return;
      
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        handleSyncCards();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSyncingCards, selectedYear]);

  // ==========================================
  // FEEDBACK DE NOTIFICAÇÃO (TOAST)
  // ==========================================
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Webhook copiado para a área de transferência!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  // ==========================================
  // RE-CÁLCULO DINÂMICO DE METRICAS (FILTRADO)
  // ==========================================
  const filteredData = useMemo(() => {
    if (!userData) return null;

    // 1. Filtra as estatísticas de commits diários
    const daily: Record<string, DailyCommit> = {};
    let total = 0;
    const platformCount = { github: 0, gitlab: 0, bitbucket: 0, codeberg: 0, local: 0 };

    Object.entries(userData.dailyCommits).forEach(([dateStr, commit]) => {
      let filteredDayCount = 0;
      let gh = platformFilters.github ? commit.github : 0;
      let gl = platformFilters.gitlab ? commit.gitlab : 0;
      let bb = platformFilters.bitbucket ? commit.bitbucket : 0;
      let cb = platformFilters.codeberg ? commit.codeberg : 0;
      let lc = platformFilters.local ? commit.local : 0;

      filteredDayCount = gh + gl + bb + cb + lc;

      if (filteredDayCount > 0) {
        daily[dateStr] = {
          total: filteredDayCount,
          github: gh,
          gitlab: gl,
          bitbucket: bb,
          codeberg: cb,
          local: lc
        };

        total += filteredDayCount;
        platformCount.github += gh;
        platformCount.gitlab += gl;
        platformCount.bitbucket += bb;
        platformCount.codeberg += cb;
        platformCount.local += lc;
      }
    });

    // 2. Calcula Plataforma Favorita
    let favorite = 'Nenhuma';
    let max = 0;
    Object.entries(platformCount).forEach(([p, c]) => {
      if (c > max) {
        max = c;
        favorite = p;
      }
    });

    // 3. Re-calcula Streaks baseadas nos filtros
    const activeDays = Object.keys(daily).sort();
    const activeDaysSet = new Set(activeDays);

    let currentStreak = 0;
    let longestStreak = 0;

    if (activeDays.length > 0) {
      // Longest Streak
      let temp = 0;
      let prev: Date | null = null;
      activeDays.forEach(dayStr => {
        const curr = new Date(dayStr);
        if (prev === null) {
          temp = 1;
        } else {
          const diffDays = Math.ceil(Math.abs(curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            temp++;
          } else if (diffDays > 1) {
            if (temp > longestStreak) longestStreak = temp;
            temp = 1;
          }
        }
        prev = curr;
      });
      if (temp > longestStreak) longestStreak = temp;

      // Current Streak
      const todayStr = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let startDayStr = '';
      if (activeDaysSet.has(todayStr)) {
        startDayStr = todayStr;
      } else if (activeDaysSet.has(yesterdayStr)) {
        startDayStr = yesterdayStr;
      }

      if (startDayStr) {
        currentStreak = 1;
        const check = new Date(startDayStr);
        while (true) {
          check.setDate(check.getDate() - 1);
          const checkStr = check.toISOString().split('T')[0];
          if (activeDaysSet.has(checkStr)) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
    }

    return {
      daily,
      stats: {
        totalCommits: total,
        currentStreak,
        longestStreak,
        activeDaysCount: activeDays.length,
        mostActivePlatform: favorite,
        platformBreakdown: platformCount,
      }
    };
  }, [userData, platformFilters]);

  // ==========================================
  // ALGORITMO DO GRID DO HEATMAP (SVG)
  // ==========================================
  const heatmapGrid = useMemo(() => {
    const days: Date[] = [];
    let startDate: Date;
    let endDate: Date;

    const now = new Date();

    if (selectedYear === 'last-year') {
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

      // Retrocede até o domingo anterior mais próximo para alinhar as semanas no grid do heatmap
      const startDayOfWeek = startDate.getDay();
      if (startDayOfWeek > 0) {
        startDate.setDate(startDate.getDate() - startDayOfWeek);
      }
    } else {
      const yearNum = typeof selectedYear === 'string' ? parseInt(selectedYear) : selectedYear;
      startDate = new Date(yearNum, 0, 1);
      endDate = new Date(yearNum, 11, 31);
    }

    const curr = new Date(startDate);
    while (curr <= endDate) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    let col = 0;
    return days.map((date, index) => {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 && index > 0) {
        col++;
      }
      const dateStr = date.toISOString().split('T')[0];
      return {
        date,
        row: dayOfWeek,
        col,
        dateStr
      };
    });
  }, [selectedYear]);

  // Rótulos dinâmicos dos meses baseados na coluna onde o mês começa na grade
  const monthLabels = useMemo(() => {
    const labels: { text: string; x: number }[] = [];
    const seenMonths = new Set<string>();

    heatmapGrid.forEach((day) => {
      const monthName = day.date.toLocaleDateString('pt-BR', { month: 'short' });
      const formattedMonth = monthName.replace('.', '').substring(0, 3);
      const capitalizedMonth = formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1);
      const monthYearKey = `${day.date.getMonth()}-${day.date.getFullYear()}`;

      if (!seenMonths.has(monthYearKey)) {
        seenMonths.add(monthYearKey);
        const xCoord = 35 + day.col * 14;
        labels.push({
          text: capitalizedMonth,
          x: xCoord
        });
      }
    });

    const filteredLabels: { text: string; x: number }[] = [];
    let lastX = -100;
    labels.forEach((label) => {
      if (label.x - lastX > 30) {
        filteredLabels.push(label);
        lastX = label.x;
      }
    });

    return filteredLabels;
  }, [heatmapGrid]);

  // Determina a cor com base nos filtros dinâmicos
  const getSquareColor = (dateStr: string) => {
    if (!filteredData) return 'hsla(224, 15%, 15%, 0.3)';
    const commits = filteredData.daily[dateStr];
    if (!commits || commits.total === 0) return 'hsla(224, 15%, 15%, 0.3)';

    // Determina a paleta baseada em quais plataformas estão ativas
    const activeFilters = Object.entries(platformFilters).filter(([_, active]) => active).map(([name]) => name);

    let palette = 'mixed';
    if (activeFilters.length === 1) {
      palette = activeFilters[0];
    }

    const count = commits.total;

    // Cores HSL baseadas no nível de contribuição e paleta ativa
    if (palette === 'github') {
      if (count < 3) return 'hsl(142, 40%, 25%)';
      if (count < 5) return 'hsl(142, 60%, 35%)';
      if (count < 7) return 'hsl(142, 80%, 45%)';
      return 'var(--color-github)';
    }
    if (palette === 'gitlab') {
      if (count < 3) return 'hsl(16, 40%, 25%)';
      if (count < 5) return 'hsl(16, 60%, 35%)';
      if (count < 7) return 'hsl(16, 80%, 45%)';
      return 'var(--color-gitlab)';
    }
    if (palette === 'bitbucket') {
      if (count < 3) return 'hsl(207, 40%, 25%)';
      if (count < 5) return 'hsl(207, 60%, 35%)';
      if (count < 7) return 'hsl(207, 80%, 45%)';
      return 'var(--color-bitbucket)';
    }
    if (palette === 'local') {
      if (count < 3) return 'hsl(282, 40%, 25%)';
      if (count < 5) return 'hsl(282, 60%, 35%)';
      if (count < 7) return 'hsl(282, 80%, 45%)';
      return 'var(--color-local)';
    }

    // Mixed Palette (Neon Teal)
    if (count < 3) return 'hsl(160, 45%, 25%)';
    if (count < 5) return 'hsl(160, 65%, 33%)';
    if (count < 7) return 'hsl(160, 80%, 40%)';
    return 'hsl(160, 100%, 46%)'; // Neon bright teal
  };

  // ==========================================
  // CONTROLE DO MOUSE (TOOLTIP FLUTUANTE)
  // ==========================================
  const handleMouseEnter = (e: React.MouseEvent<SVGRectElement>, dateStr: string) => {
    if (!userData) return;
    const commits = userData.dailyCommits[dateStr] || { total: 0, github: 0, gitlab: 0, bitbucket: 0, codeberg: 0, local: 0 };
    
    // Formata a data (ex: "18 de maio de 2026")
    const date = new Date(dateStr + 'T12:00:00.000Z');
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedDate = date.toLocaleDateString('pt-BR', options);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + window.scrollX - 70; // Centraliza levemente
    const y = rect.top + window.scrollY - 130; // Posiciona acima do quadrado

    setTooltip({
      visible: true,
      x,
      y,
      dateStr: formattedDate,
      commits,
    });
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  return (
    <div className="app-container">
      {/* Elementos Estéticos de Fundo (Pulsar Orbes) */}
      <div className="bg-glowing-orbs">
        <div className="orb-1"></div>
        <div className="orb-2"></div>
      </div>

      {/* BARRA LATERAL FIXA (SIDEBAR) */}
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header-toggle">
          <button 
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            <Menu size={20} />
          </button>
        </div>

        <div className="sidebar-brand">
          <div className="brand-dot"></div>
          <span className="brand-name">GitPulse</span>
          <span className="self-hosted-badge">Self-Hosted</span>
        </div>

        <nav>
          <ul className="nav-menu">
            <li>
              <button 
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <Activity size={18} />
                <span>Dashboard</span>
              </button>
            </li>
            <li>
              <button 
                className={`nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
                onClick={() => setActiveTab('integrations')}
              >
                <Layers size={18} />
                <span>Integrações</span>
              </button>
            </li>
            <li>
              <button 
                className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <Settings size={18} />
                <span>Configurações</span>
              </button>
            </li>
          </ul>
        </nav>

        {userData && (
          <div className="sidebar-footer">
            <div className="user-avatar">
              {userData.user.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="user-info-text">
              <span className="user-name">{userData.user.name}</span>
              <span className="user-role">@{userData.user.username}</span>
            </div>
          </div>
        )}
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className={`main-content ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="main-content-inner">
          {/* CABEÇALHO */}
        <header className="top-header">
          <div className="page-title-group">
            <h1>
              {activeTab === 'dashboard' && 'Visão Geral'}
              {activeTab === 'integrations' && 'Integrações'}
              {activeTab === 'settings' && 'Configurações'}
            </h1>
            <span className="page-subtitle">
              {activeTab === 'dashboard' && 'Monitore suas contribuições consolidadas em tempo real.'}
              {activeTab === 'integrations' && 'Configure seus Webhooks e conecte seus provedores Git.'}
              {activeTab === 'settings' && 'Gerencie seu perfil de desenvolvedor e e-mails vinculados.'}
            </span>
          </div>

          <div className="header-actions">
          {userData && (
            <div className="header-actions">
              {activeTab === 'dashboard' && (
                <select 
                  className="year-selector" 
                  value={selectedYear}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedYear(val === 'last-year' ? 'last-year' : parseInt(val));
                  }}
                >
                  <option value="last-year">No último ano</option>
                  {userData?.years?.map((yr) => (
                    <option key={yr} value={yr}>
                      Ano de {yr}
                    </option>
                  ))}
                </select>
              )}
              
              <button 
                className="btn-icon" 
                onClick={handleSyncCards} 
                disabled={isSyncingCards || loading}
                title="Sincronizar com o GitHub"
              >
                <RefreshCw size={14} className={isSyncingCards || loading ? 'spin' : ''} />
                Sincronizar
              </button>
            </div>
          )}
          </div>
        </header>

        {/* LOADING STATE */}
        {loading && !userData && (
          <div className="loading-container glass-panel">
            <div className="spinner"></div>
            <span className="loading-text">CARREGANDO GITPULSE...</span>
          </div>
        )}

        {/* ERROR STATE */}
        {error && !userData && (
          <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', borderColor: 'var(--error)' }}>
            <h3 style={{ color: 'var(--error)', marginBottom: '8px' }}>Erro ao conectar com a API</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>{error}</p>
            <button className="btn-primary" onClick={() => fetchSummary()}>Tentar Novamente</button>
          </div>
        )}

        {/* WELCOME / EMPTY STATE */}
        {!userData && !loading && !error && (
          <div className="glass-panel animate-fade-in" style={{ padding: '48px 32px', textAlign: 'center', maxWidth: '600px', margin: '80px auto' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '16px', background: 'linear-gradient(135deg, #fff 0%, var(--text-muted) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Bem-vindo ao GitPulse! 🌌
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.96rem', lineHeight: '1.6', marginBottom: '32px' }}>
              Nenhum perfil de desenvolvedor ativo foi detectado. Para começar a centralizar e analisar suas contribuições do GitHub, GitLab, Bitbucket ou Codeberg, crie seu primeiro perfil abaixo.
            </p>

            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const newU = (form.elements.namedItem('welcome-username') as HTMLInputElement).value.trim();
                const newN = (form.elements.namedItem('welcome-name') as HTMLInputElement).value.trim();
                const newE = (form.elements.namedItem('welcome-email') as HTMLInputElement).value.trim();

                if (!newU || !newN) return;

                try {
                  setLoading(true);
                  const response = await fetch(`${backendUrl}/api/v1/users`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      username: newU,
                      name: newN,
                      emails: newE ? [newE] : [],
                    }),
                  });

                  const data = await response.json();
                  if (!response.ok) {
                    throw new Error(data.error || 'Erro ao cadastrar perfil');
                  }

                  showToast('Perfil cadastrado com sucesso!', 'success');
                  localStorage.setItem('gitpulse_username', newU);
                  setUsername(newU);
                  form.reset();
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Falha ao cadastrar perfil', 'error');
                } finally {
                  setLoading(false);
                }
              }} 
              style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}
            >
              <div className="settings-profile-field" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <label htmlFor="welcome-username" className="settings-profile-label">Nome de Usuário (GitHub/Codeberg)</label>
                <input
                  id="welcome-username"
                  name="welcome-username"
                  type="text"
                  className="form-input"
                  style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', marginTop: '6px' }}
                  placeholder="Ex: torvalds"
                  required
                />
              </div>
              <div className="settings-profile-field" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <label htmlFor="welcome-name" className="settings-profile-label">Nome Completo</label>
                <input
                  id="welcome-name"
                  name="welcome-name"
                  type="text"
                  className="form-input"
                  style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', marginTop: '6px' }}
                  placeholder="Ex: Linus Torvalds"
                  required
                />
              </div>
              <div className="settings-profile-field" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <label htmlFor="welcome-email" className="settings-profile-label">E-mail de Autor (Opcional)</label>
                <input
                  id="welcome-email"
                  name="welcome-email"
                  type="email"
                  className="form-input"
                  style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', marginTop: '6px' }}
                  placeholder="Ex: linus@git.org"
                />
              </div>
              <button 
                type="submit" 
                className="btn-add-email" 
                style={{ marginTop: '12px', padding: '12px', display: 'flex', justifyContent: 'center', width: '100%', background: 'var(--color-accent)' }}
              >
                Criar Perfil e Começar
              </button>
            </form>
          </div>
        )}

        {/* ==========================================
            TAB: DASHBOARD
            ========================================== */}
        {activeTab === 'dashboard' && userData && filteredData && (
          <div className="animate-fade-in">
            {/* CARDS DE MÉTRICAS */}
            <section className="metrics-grid">
              <div className={`glass-panel metric-card total ${isSyncingCards ? 'syncing' : ''}`}>
                <div className="metric-header">
                  <span>Commits Totais</span>
                  <div className="metric-icon-box">
                    <Activity size={18} />
                  </div>
                </div>
                <div className="metric-card-val">
                  {isSyncingCards ? (
                    <span className="skeleton-shimmer val-shimmer"></span>
                  ) : (
                    <>
                      {filteredData.stats.totalCommits}
                      <span className="metric-unit">commits</span>
                    </>
                  )}
                </div>
                <div className="metric-footer">
                  {isSyncingCards ? (
                    <span className="skeleton-shimmer footer-shimmer"></span>
                  ) : (
                    <>
                      <TrendingUp size={12} style={{ color: 'var(--color-github)' }} />
                      <span>{selectedYear === 'last-year' ? 'no último ano' : `no ano de ${selectedYear}`}</span>
                    </>
                  )}
                </div>
              </div>

              <div className={`glass-panel metric-card streak ${isSyncingCards ? 'syncing' : ''}`}>
                <div className="metric-header">
                  <span>Sequência Atual</span>
                  <div className="metric-icon-box">
                    <Flame size={18} />
                  </div>
                </div>
                <div className="metric-card-val">
                  {isSyncingCards ? (
                    <span className="skeleton-shimmer val-shimmer"></span>
                  ) : (
                    <>
                      {filteredData.stats.currentStreak}
                      <span className="metric-unit">dias</span>
                    </>
                  )}
                </div>
                <div className="metric-footer">
                  {isSyncingCards ? (
                    <span className="skeleton-shimmer footer-shimmer"></span>
                  ) : (
                    <span>🔥 streak ativo no momento</span>
                  )}
                </div>
              </div>

              <div className={`glass-panel metric-card record ${isSyncingCards ? 'syncing' : ''}`}>
                <div className="metric-header">
                  <span>Sequência Recorde</span>
                  <div className="metric-icon-box">
                    <Award size={18} />
                  </div>
                </div>
                <div className="metric-card-val">
                  {isSyncingCards ? (
                    <span className="skeleton-shimmer val-shimmer"></span>
                  ) : (
                    <>
                      {filteredData.stats.longestStreak}
                      <span className="metric-unit">dias</span>
                    </>
                  )}
                </div>
                <div className="metric-footer">
                  {isSyncingCards ? (
                    <span className="skeleton-shimmer footer-shimmer"></span>
                  ) : (
                    <span>🏆 seu recorde histórico {selectedYear === 'last-year' ? 'no último ano' : `em ${selectedYear}`}</span>
                  )}
                </div>
              </div>

              <div className={`glass-panel metric-card active ${isSyncingCards ? 'syncing' : ''}`}>
                <div className="metric-header">
                  <span>Dias Ativos</span>
                  <div className="metric-icon-box">
                    <Calendar size={18} />
                  </div>
                </div>
                <div className="metric-card-val">
                  {isSyncingCards ? (
                    <span className="skeleton-shimmer val-shimmer"></span>
                  ) : (
                    <>
                      {filteredData.stats.activeDaysCount}
                      <span className="metric-unit">dias</span>
                    </>
                  )}
                </div>
                <div className="metric-footer">
                  {isSyncingCards ? (
                    <span className="skeleton-shimmer footer-shimmer"></span>
                  ) : (
                    <span>📅 dias com commit cadastrado</span>
                  )}
                </div>
              </div>
            </section>

            {/* SEÇÃO DO HEATMAP */}
            <section className="glass-panel heatmap-section">
              <div className="heatmap-header">
                <h3 className="section-title">Mapa de Calor Unificado</h3>
                
                {/* FILTROS INTERATIVOS POR PLATAFORMA */}
                <div className="heatmap-filters">
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '4px' }}>
                    FILTRAR PLATAFORMA:
                  </span>
                  <button 
                    className={`filter-btn ${platformFilters.github ? 'active github' : ''}`}
                    onClick={() => setPlatformFilters(prev => ({ ...prev, github: !prev.github }))}
                  >
                    <div className="filter-indicator"></div>
                    GitHub
                  </button>
                  <button 
                    className={`filter-btn ${platformFilters.gitlab ? 'active gitlab' : ''}`}
                    onClick={() => setPlatformFilters(prev => ({ ...prev, gitlab: !prev.gitlab }))}
                  >
                    <div className="filter-indicator"></div>
                    GitLab
                  </button>
                  <button 
                    className={`filter-btn ${platformFilters.bitbucket ? 'active bitbucket' : ''}`}
                    onClick={() => setPlatformFilters(prev => ({ ...prev, bitbucket: !prev.bitbucket }))}
                  >
                    <div className="filter-indicator"></div>
                    Bitbucket
                  </button>
                  <button 
                    className={`filter-btn ${platformFilters.codeberg ? 'active codeberg' : ''}`}
                    onClick={() => setPlatformFilters(prev => ({ ...prev, codeberg: !prev.codeberg }))}
                  >
                    <div className="filter-indicator"></div>
                    Codeberg
                  </button>
                  <button 
                    className={`filter-btn ${platformFilters.local ? 'active local' : ''}`}
                    onClick={() => setPlatformFilters(prev => ({ ...prev, local: !prev.local }))}
                  >
                    <div className="filter-indicator"></div>
                    Local
                  </button>
                </div>
              </div>

              {/* RENDERIZAÇÃO DO SVG HEATMAP */}
              <div className="heatmap-wrapper">
                <svg 
                  width="815" 
                  height="125" 
                  className="heatmap-svg"
                >
                  {/* Month Labels */}
                  {monthLabels.map((label, i) => (
                    <text key={i} x={label.x} y="12" className="month-label">
                      {label.text}
                    </text>
                  ))}

                  {/* Weekday Labels (Seg, Qua, Sex) */}
                  <text x="10" y="41" className="weekday-label">Seg</text>
                  <text x="10" y="69" className="weekday-label">Qua</text>
                  <text x="10" y="97" className="weekday-label">Sex</text>

                  {/* Grid squares */}
                  {heatmapGrid.map((day) => {
                    const xCoord = 35 + day.col * 14;
                    const yCoord = 20 + day.row * 14;
                    const fill = getSquareColor(day.dateStr);

                    return (
                      <rect
                        key={day.dateStr}
                        x={xCoord}
                        y={yCoord}
                        width="11"
                        height="11"
                        rx="2"
                        ry="2"
                        className="day-square"
                        fill={fill}
                        onMouseEnter={(e) => handleMouseEnter(e, day.dateStr)}
                        onMouseLeave={handleMouseLeave}
                      />
                    );
                  })}
                </svg>
              </div>

              <div className="heatmap-footer">
                <span>Menos</span>
                <div className="heatmap-legend-scale">
                  <div className="legend-square" style={{ backgroundColor: 'hsla(224, 15%, 15%, 0.3)', border: '1px solid var(--border-color)' }}></div>
                  <div className="legend-square" style={{ backgroundColor: 'hsl(160, 40%, 25%)' }}></div>
                  <div className="legend-square" style={{ backgroundColor: 'hsl(160, 60%, 35%)' }}></div>
                  <div className="legend-square" style={{ backgroundColor: 'hsl(160, 80%, 45%)' }}></div>
                  <div className="legend-square" style={{ backgroundColor: 'hsl(160, 100%, 55%)' }}></div>
                </div>
                <span>Mais</span>
              </div>
            </section>

            {/* GRÁFICO DE ATIVIDADE */}
            <CommitLineChart
              dailyCommits={userData.dailyCommits}
              selectedYear={selectedYear}
              platformFilters={platformFilters}
            />

            {/* PLATFORM BREAKDOWN E ALIASES DE E-MAIL */}
            <div className="breakdown-row">
              <section className="glass-panel breakdown-card">
                <h3 className="section-title">Distribuição por Provedor</h3>
                
                <div className="platforms-list">
                  {Object.entries(filteredData.stats.platformBreakdown).map(([platform, count]) => {
                    const total = filteredData.stats.totalCommits || 1;
                    const percentage = Math.round((count / total) * 100);

                    return (
                      <div className={`platform-row ${platform}`} key={platform}>
                        <div className="platform-icon-circle">
                          {platform.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="platform-progress-container">
                          <div className="platform-progress-label">
                            <span className="platform-name">{platform}</span>
                            <span>{count} commits ({percentage}%)</span>
                          </div>
                          <div className="platform-progress-track">
                            <div 
                              className="platform-progress-bar"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="glass-panel breakdown-card">
                <h3 className="section-title">E-mails Vinculados</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '16px' }}>
                  Commits enviados via Webhook que possuírem qualquer um dos e-mails de autor abaixo serão contabilizados no seu perfil.
                </p>

                <div className="aliases-box">
                  {userData.user.emailAliases.map((email) => (
                    <div className="alias-tag" key={email}>
                      <div className="alias-dot"></div>
                      {email}
                    </div>
                  ))}
                  
                  <div style={{ marginTop: '20px', padding: '12px', border: '1px dashed var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Mail size={16} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Precisa vincular outro? Use o formulário ou cadastre na API.
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB: INTEGRATIONS
            ========================================== */}
        {activeTab === 'integrations' && userData && (
          <div className="glass-panel integrations-layout animate-fade-in" style={{ padding: '32px' }}>
            <h3 className="section-title">Seu Endpoint Exclusivo</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Cole esta URL nas configurações de Webhooks do seu repositório para centralizar os pushes de forma automática.
            </p>

            <div className="webhook-box">
              <span className="webhook-url">
                {backendUrl}/api/v1/webhooks/{userData.user.webhookToken}
              </span>
              <button 
                className="btn-icon" 
                onClick={() => copyToClipboard(`${backendUrl}/api/v1/webhooks/${userData.user.webhookToken}`)}
              >
                {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                {copied ? 'Copiado!' : 'Copiar URL'}
              </button>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

            <h3 className="section-title" style={{ marginBottom: '16px' }}>Como Configurar (Passo a Passo)</h3>
            
            <div className="integration-tabs">
              <button 
                className={`int-tab ${activeIntTab === 'github' ? 'active' : ''}`}
                onClick={() => setActiveIntTab('github')}
              >
                GitHub
              </button>
              <button 
                className={`int-tab ${activeIntTab === 'gitlab' ? 'active' : ''}`}
                onClick={() => setActiveIntTab('gitlab')}
              >
                GitLab
              </button>
              <button 
                className={`int-tab ${activeIntTab === 'bitbucket' ? 'active' : ''}`}
                onClick={() => setActiveIntTab('bitbucket')}
              >
                Bitbucket
              </button>
              <button 
                className={`int-tab ${activeIntTab === 'codeberg' ? 'active' : ''}`}
                onClick={() => setActiveIntTab('codeberg')}
              >
                Codeberg
              </button>
              <button 
                className={`int-tab ${activeIntTab === 'local' ? 'active' : ''}`}
                onClick={() => setActiveIntTab('local')}
              >
                Commits Locais (Script)
              </button>
            </div>

            {activeIntTab === 'github' && (
              <div className="animate-fade-in">
                <div className="guide-step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <span className="step-title">Vá nas Configurações</span>
                    <p className="step-desc">
                      No seu repositório do GitHub, navegue até a aba <strong>Settings</strong> no menu superior e clique em <strong>Webhooks</strong> na barra lateral esquerda.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <span className="step-title">Adicione o Webhook</span>
                    <p className="step-desc">
                      Clique no botão <strong>Add webhook</strong> no canto superior direito.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <span className="step-title">Insira as Credenciais</span>
                    <p className="step-desc">
                      Preencha as configurações do webhook com os seguintes valores:
                    </p>
                    <div className="code-block" style={{ marginBottom: '12px' }}>
                      Payload URL: {backendUrl}/api/v1/webhooks/{userData.user.webhookToken}<br />
                      Content type: application/json<br />
                      Secret: (deixe em branco)
                    </div>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">4</div>
                  <div className="step-content">
                    <span className="step-title">Defina os Gatilhos</span>
                    <p className="step-desc">
                      Selecione <strong>Just the push event</strong> (Apenas o evento de push) e marque a opção <strong>Active</strong>. Clique em <strong>Add webhook</strong> para salvar. Pronto!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeIntTab === 'gitlab' && (
              <div className="animate-fade-in">
                <div className="guide-step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <span className="step-title">Navegue até Webhooks</span>
                    <p className="step-desc">
                      No seu projeto do GitLab, vá em <strong>Settings</strong> na barra lateral e escolha <strong>Webhooks</strong>.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <span className="step-title">Adicione a Nova URL</span>
                    <p className="step-desc">
                      Cole a sua URL do GitPulse no campo <strong>URL</strong>.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <span className="step-title">Selecione o Gatilho</span>
                    <p className="step-desc">
                      Marque o checkbox para <strong>Push events</strong>. Se desejar, insira uma ramificação específica ou deixe em branco para rastrear todas.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">4</div>
                  <div className="step-content">
                    <span className="step-title">Salvar Integração</span>
                    <p className="step-desc">
                      Desmarque "Enable SSL verification" (se estiver rodando localhost sem HTTPS) e clique em <strong>Add webhook</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeIntTab === 'bitbucket' && (
              <div className="animate-fade-in">
                <div className="guide-step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <span className="step-title">Acesse Configurações do Repositório</span>
                    <p className="step-desc">
                      No Bitbucket, abra o repositório, clique em <strong>Repository settings</strong> no menu lateral e selecione <strong>Webhooks</strong>.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <span className="step-title">Adicionar Webhook</span>
                    <p className="step-desc">
                      Clique em <strong>Add webhook</strong>, defina um Título (ex: "GitPulse") e insira a URL exclusiva no campo correspondente.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <span className="step-title">Marque os Eventos</span>
                    <p className="step-desc">
                      Em <strong>Triggers</strong>, mantenha "Repository push" selecionado e clique em <strong>Save</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeIntTab === 'codeberg' && (
              <div className="animate-fade-in">
                <div className="guide-step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <span className="step-title">Acesse Configurações do Codeberg</span>
                    <p className="step-desc">
                      No seu repositório do Codeberg, navegue até a aba <strong>Settings</strong> (Configurações) no menu superior e clique em <strong>Webhooks</strong> na barra lateral esquerda.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <span className="step-title">Adicionar Webhook</span>
                    <p className="step-desc">
                      Clique em <strong>Add Webhook</strong> (Adicionar Webhook) e selecione o tipo <strong>Gitea</strong>.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <span className="step-title">Configurar URL e Eventos</span>
                    <p className="step-desc">
                      Cole a URL exclusiva gerada no campo <strong>Payload URL</strong>, defina o Content Type como <strong>application/json</strong>, selecione apenas o evento de <strong>Push</strong> e clique em <strong>Add Webhook</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeIntTab === 'local' && (
              <div className="animate-fade-in">
                <p className="step-desc" style={{ fontSize: '0.92rem', marginBottom: '20px' }}>
                  Quer contabilizar commits de um repositório privado da empresa ou de um servidor local que não possui acesso à internet para disparar webhooks?
                  Você pode usar um script bash simples de automação local na sua máquina!
                </p>
                <div className="guide-step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <span className="step-title">Script de Sincronização Local</span>
                    <p className="step-desc">
                      Crie um script com o conteúdo abaixo dentro da raiz do seu repositório local. Ele lerá os últimos 5 commits do git log e fará o envio direto para a API.
                    </p>
                    <div className="code-block" style={{ fontSize: '0.8rem', lineHeight: '1.5' }}>
                      {`# sync-pulse.sh\n`}
                      {`COMMITS=$(git log -n 5 --pretty=format:'{"hash":"%H","message":"%s","timestamp":"%cI","authorEmail":"%ae"}' | paste -sd, -)\n\n`}
                      {`PAYLOAD='{"simulated":true,"platform":"local","commits":['$COMMITS']}'\n\n`}
                      {`curl -X POST -H "Content-Type: application/json" \\ \n`}
                      {`  -d "$PAYLOAD" \\ \n`}
                      {`  ${backendUrl}/api/v1/webhooks/${userData.user.webhookToken}`}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            TAB: SETTINGS
            ========================================== */}
        {activeTab === 'settings' && userData && (
          <div className="settings-container animate-fade-in">
            <section className="glass-panel settings-section">
              <h3 className="section-title">Perfil do Desenvolvedor</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: '24px' }}>
                Estes são seus dados básicos de identificação sincronizados na plataforma.
              </p>

              <div className="settings-grid">
                <form onSubmit={handleSaveProfile} className="settings-profile-card">
                  <div className="settings-profile-field">
                    <label htmlFor="input-profile-name" className="settings-profile-label">Nome Completo</label>
                    <input
                      id="input-profile-name"
                      type="text"
                      className="form-input"
                      style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', marginTop: '4px' }}
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      disabled={isSavingProfile}
                      required
                    />
                  </div>
                  <div className="settings-profile-field">
                    <span className="settings-profile-label">Nome de Usuário</span>
                    <span className="settings-profile-value">@{userData.user.username}</span>
                  </div>
                  <button 
                    type="submit" 
                    className="btn-add-email" 
                    style={{ marginTop: '8px', alignSelf: 'flex-start', padding: '10px 18px' }}
                    disabled={isSavingProfile || profileName.trim() === userData.user.name}
                  >
                    {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </form>

                <div className="settings-profile-card" style={{ justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="user-avatar" style={{ width: '60px', height: '60px', fontSize: '1.4rem' }}>
                      {userData.user.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{userData.user.name}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Desenvolvedor Ativo</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="glass-panel settings-section">
              <h3 className="section-title">Alternar / Cadastrar Perfil</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: '20px' }}>
                Troque para outra conta ativa ou cadastre um novo perfil de desenvolvedor local neste GitPulse.
              </p>

              <div className="settings-grid" style={{ gap: '24px' }}>
                {/* ALTERNAR PERFIL */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const targetInput = (e.target as HTMLFormElement).elements.namedItem('switch-username') as HTMLInputElement;
                    const val = targetInput.value.trim();
                    if (val) {
                      localStorage.setItem('gitpulse_username', val);
                      setUsername(val);
                      showToast(`Alternado para o perfil @${val}`, 'success');
                    }
                  }} 
                  className="settings-profile-card"
                >
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Alternar Perfil Ativo</h4>
                  <div className="settings-profile-field">
                    <label htmlFor="switch-username" className="settings-profile-label">Username do Perfil</label>
                    <input
                      id="switch-username"
                      name="switch-username"
                      type="text"
                      className="form-input"
                      style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', marginTop: '4px' }}
                      placeholder="Ex: seu-usuario"
                      required
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn-add-email" 
                    style={{ marginTop: '8px', alignSelf: 'flex-start', padding: '10px 18px', background: 'var(--color-accent)' }}
                  >
                    Trocar Perfil
                  </button>
                </form>

                {/* CADASTRAR NOVO PERFIL */}
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const newU = (form.elements.namedItem('new-username') as HTMLInputElement).value.trim();
                    const newN = (form.elements.namedItem('new-name') as HTMLInputElement).value.trim();
                    const newE = (form.elements.namedItem('new-email') as HTMLInputElement).value.trim();

                    if (!newU || !newN) return;

                    try {
                      const response = await fetch(`${backendUrl}/api/v1/users`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          username: newU,
                          name: newN,
                          emails: newE ? [newE] : [],
                        }),
                      });

                      const data = await response.json();
                      if (!response.ok) {
                        throw new Error(data.error || 'Erro ao cadastrar novo perfil');
                      }

                      showToast('Novo perfil cadastrado com sucesso!', 'success');
                      localStorage.setItem('gitpulse_username', newU);
                      setUsername(newU);
                      form.reset();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Falha ao cadastrar perfil', 'error');
                    }
                  }} 
                  className="settings-profile-card"
                >
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Criar Novo Perfil</h4>
                  <div className="settings-profile-field">
                    <label htmlFor="new-username" className="settings-profile-label">Username (GitHub/Codeberg)</label>
                    <input
                      id="new-username"
                      name="new-username"
                      type="text"
                      className="form-input"
                      style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', marginTop: '4px' }}
                      placeholder="Ex: torvalds"
                      required
                    />
                  </div>
                  <div className="settings-profile-field">
                    <label htmlFor="new-name" className="settings-profile-label">Nome Completo</label>
                    <input
                      id="new-name"
                      name="new-name"
                      type="text"
                      className="form-input"
                      style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', marginTop: '4px' }}
                      placeholder="Ex: Linus Torvalds"
                      required
                    />
                  </div>
                  <div className="settings-profile-field">
                    <label htmlFor="new-email" className="settings-profile-label">E-mail Inicial (Opcional)</label>
                    <input
                      id="new-email"
                      name="new-email"
                      type="email"
                      className="form-input"
                      style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', marginTop: '4px' }}
                      placeholder="Ex: linus@git.org"
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn-add-email" 
                    style={{ marginTop: '8px', alignSelf: 'flex-start', padding: '10px 18px', background: 'var(--success)' }}
                  >
                    Cadastrar e Entrar
                  </button>
                </form>
              </div>
            </section>

            <section className="glass-panel settings-section">
              <h3 className="section-title">Gerenciador de E-mails (Aliases)</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: '16px' }}>
                Commits enviados via Webhook que possuírem qualquer um dos e-mails de autor abaixo serão consolidados no seu perfil.
              </p>

              <div className="email-list-container">
                {userData.user.emailAliases.map((email) => (
                  <div key={email} className="email-item-row">
                    <div className="email-text-box">
                      <span className="email-dot-active"></span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{email}</span>
                    </div>
                    <button
                      className="btn-delete-email"
                      title="Remover e-mail"
                      disabled={userData.user.emailAliases.length <= 1}
                      onClick={() => handleDeleteEmail(email)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddEmailSubmit} className="settings-email-form">
                <input
                  type="email"
                  className="form-input"
                  placeholder="exemplo@desenvolvedor.com"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isAddingEmail}
                />
                <button 
                  type="submit" 
                  className="btn-add-email" 
                  disabled={isAddingEmail || !newEmail.trim()}
                >
                  <Plus size={16} />
                  {isAddingEmail ? 'Adicionando...' : 'Adicionar E-mail'}
                </button>
              </form>
            </section>
          </div>
        )}
        </div>

      </main>

      {/* PORTAL DO TOOLTIP FLUTUANTE */}
      {tooltip.visible && tooltip.commits && (
        <div 
          className="tooltip-portal animate-fade-in"
          style={{ 
            left: `${tooltip.x}px`, 
            top: `${tooltip.y}px` 
          }}
        >
          <span className="tooltip-date">{tooltip.dateStr}</span>
          <div className="tooltip-total">
            <Activity size={12} style={{ color: 'var(--color-github)' }} />
            <span>{tooltip.commits.total} commits</span>
          </div>
          
          <div className="tooltip-breakdown">
            {tooltip.commits.github > 0 && (
              <div className="tooltip-item">
                <span><span className="tooltip-dot github"></span>GitHub:</span>
                <span style={{ fontWeight: 600 }}>{tooltip.commits.github}</span>
              </div>
            )}
            {tooltip.commits.gitlab > 0 && (
              <div className="tooltip-item">
                <span><span className="tooltip-dot gitlab"></span>GitLab:</span>
                <span style={{ fontWeight: 600 }}>{tooltip.commits.gitlab}</span>
              </div>
            )}
            {tooltip.commits.bitbucket > 0 && (
              <div className="tooltip-item">
                <span><span className="tooltip-dot bitbucket"></span>Bitbucket:</span>
                <span style={{ fontWeight: 600 }}>{tooltip.commits.bitbucket}</span>
              </div>
            )}
            {tooltip.commits.local > 0 && (
              <div className="tooltip-item">
                <span><span className="tooltip-dot local"></span>Local:</span>
                <span style={{ fontWeight: 600 }}>{tooltip.commits.local}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOAST DE NOTIFICAÇÃO FLUTUANTE */}
      <div className={`toast-notification ${toast ? `show ${toast.type}` : ''}`}>
        {toast && (
          <>
            <div className="toast-msg">{toast.message}</div>
          </>
        )}
      </div>
    </div>
  );
}
