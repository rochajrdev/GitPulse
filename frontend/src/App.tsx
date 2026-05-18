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
  TrendingUp
} from 'lucide-react';

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
  local: number;
}

interface Summary {
  user: User;
  stats: Stats;
  dailyCommits: Record<string, DailyCommit>;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'integrations'>('dashboard');
  const [userData, setUserData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [toast, setToast] = useState<Toast | null>(null);
  const [copied, setCopied] = useState(false);

  // Filtros de Plataforma
  const [platformFilters, setPlatformFilters] = useState({
    github: true,
    gitlab: true,
    bitbucket: true,
    local: true,
  });

  // Estado para Guia de Integração
  const [activeIntTab, setActiveIntTab] = useState<'github' | 'gitlab' | 'bitbucket' | 'local'>('github');

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
  const username = 'rochajrdev';

  // ==========================================
  // CARREGAR DADOS DO BACKEND
  // ==========================================
  const fetchSummary = async (showNotification = false) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${backendUrl}/api/v1/users/${username}/summary?year=${selectedYear}`);
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

  const handleSyncGitHub = async () => {
    try {
      setLoading(true);
      setError(null);
      showToast('Sincronizando dados reais com o GitHub... Por favor, aguarde.', 'info');
      
      const response = await fetch(`${backendUrl}/api/v1/users/${username}/sync`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Falha ao sincronizar dados com o GitHub');
      }
      
      // Recarrega os dados do painel para exibir os dados novos
      await fetchSummary(false);
      
      showToast('Histórico completo sincronizado com o GitHub!', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na sincronização');
      showToast('Erro ao sincronizar com o GitHub. Verifique seu token.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [selectedYear]);

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
    const platformCount = { github: 0, gitlab: 0, bitbucket: 0, local: 0 };

    Object.entries(userData.dailyCommits).forEach(([dateStr, commit]) => {
      let filteredDayCount = 0;
      let gh = platformFilters.github ? commit.github : 0;
      let gl = platformFilters.gitlab ? commit.gitlab : 0;
      let bb = platformFilters.bitbucket ? commit.bitbucket : 0;
      let lc = platformFilters.local ? commit.local : 0;

      filteredDayCount = gh + gl + bb + lc;

      if (filteredDayCount > 0) {
        daily[dateStr] = {
          total: filteredDayCount,
          github: gh,
          gitlab: gl,
          bitbucket: bb,
          local: lc
        };

        total += filteredDayCount;
        platformCount.github += gh;
        platformCount.gitlab += gl;
        platformCount.bitbucket += bb;
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
    // Gera todos os dias do ano selecionado
    const startDate = new Date(selectedYear, 0, 1);
    const endDate = new Date(selectedYear, 11, 31);
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
    const commits = userData.dailyCommits[dateStr] || { total: 0, github: 0, gitlab: 0, bitbucket: 0, local: 0 };
    
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
      <aside className="sidebar">
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
                Dashboard
              </button>
            </li>
            <li>
              <button 
                className={`nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
                onClick={() => setActiveTab('integrations')}
              >
                <Layers size={18} />
                Integrações
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
      <main className="main-content">
        {/* CABEÇALHO */}
        <header className="top-header">
          <div className="page-title-group">
            <h1>
              {activeTab === 'dashboard' && 'Visão Geral'}
              {activeTab === 'integrations' && 'Integrações'}
            </h1>
            <span className="page-subtitle">
              {activeTab === 'dashboard' && 'Monitore suas contribuições consolidadas em tempo real.'}
              {activeTab === 'integrations' && 'Configure seus Webhooks e conecte seus provedores Git.'}
            </span>
          </div>

          <div className="header-actions">
            {activeTab === 'dashboard' && (
              <select 
                className="year-selector" 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                <option value={2026}>Ano de 2026</option>
                <option value={2025}>Ano de 2025</option>
              </select>
            )}
            
            <button 
              className="btn-icon" 
              onClick={handleSyncGitHub} 
              disabled={loading}
              title="Sincronizar com o GitHub"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Sincronizar
            </button>
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

        {/* ==========================================
            TAB: DASHBOARD
            ========================================== */}
        {activeTab === 'dashboard' && userData && filteredData && (
          <div className="animate-fade-in">
            {/* CARDS DE MÉTRICAS */}
            <section className="metrics-grid">
              <div className="glass-panel metric-card total">
                <div className="metric-header">
                  <span>Commits Totais</span>
                  <div className="metric-icon-box">
                    <Activity size={18} />
                  </div>
                </div>
                <div className="metric-card-val">
                  {filteredData.stats.totalCommits}
                  <span className="metric-unit">commits</span>
                </div>
                <div className="metric-footer">
                  <TrendingUp size={12} style={{ color: 'var(--color-github)' }} />
                  <span>no ano de {selectedYear}</span>
                </div>
              </div>

              <div className="glass-panel metric-card streak">
                <div className="metric-header">
                  <span>Sequência Atual</span>
                  <div className="metric-icon-box">
                    <Flame size={18} />
                  </div>
                </div>
                <div className="metric-card-val">
                  {filteredData.stats.currentStreak}
                  <span className="metric-unit">dias</span>
                </div>
                <div className="metric-footer">
                  <span>🔥 streak ativo no momento</span>
                </div>
              </div>

              <div className="glass-panel metric-card record">
                <div className="metric-header">
                  <span>Sequência Recorde</span>
                  <div className="metric-icon-box">
                    <Award size={18} />
                  </div>
                </div>
                <div className="metric-card-val">
                  {filteredData.stats.longestStreak}
                  <span className="metric-unit">dias</span>
                </div>
                <div className="metric-footer">
                  <span>🏆 seu recorde histórico em {selectedYear}</span>
                </div>
              </div>

              <div className="glass-panel metric-card active">
                <div className="metric-header">
                  <span>Dias Ativos</span>
                  <div className="metric-icon-box">
                    <Calendar size={18} />
                  </div>
                </div>
                <div className="metric-card-val">
                  {filteredData.stats.activeDaysCount}
                  <span className="metric-unit">dias</span>
                </div>
                <div className="metric-footer">
                  <span>📅 dias com commit cadastrado</span>
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
                  <text x="35" y="12" className="month-label">Jan</text>
                  <text x="100" y="12" className="month-label">Fev</text>
                  <text x="165" y="12" className="month-label">Mar</text>
                  <text x="230" y="12" className="month-label">Abr</text>
                  <text x="295" y="12" className="month-label">Mai</text>
                  <text x="360" y="12" className="month-label">Jun</text>
                  <text x="425" y="12" className="month-label">Jul</text>
                  <text x="490" y="12" className="month-label">Ago</text>
                  <text x="555" y="12" className="month-label">Set</text>
                  <text x="620" y="12" className="month-label">Out</text>
                  <text x="685" y="12" className="month-label">Nov</text>
                  <text x="750" y="12" className="month-label">Dez</text>

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
