import React, { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';

interface DailyCommit {
  total: number;
  github: number;
  gitlab: number;
  bitbucket: number;
  codeberg: number;
  local: number;
  azure?: number;
}

interface CommitLineChartProps {
  dailyCommits: Record<string, DailyCommit>;
  platformFilters: Record<string, boolean>;
}

export default function CommitLineChart({ dailyCommits, platformFilters }: CommitLineChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  // 1. Determina a cor do gráfico baseada nos filtros ativos
  const { chartColor, gradientId } = useMemo(() => {
    const activeFilters = Object.entries(platformFilters)
      .filter(([_, active]) => active)
      .map(([name]) => name);

    let color = 'hsl(160, 100%, 46%)'; // Neon bright teal
    let gradId = 'gradient-mixed';

    if (activeFilters.length === 1) {
      const platform = activeFilters[0];
      if (platform === 'github') {
        color = 'var(--color-github)';
        gradId = 'gradient-github';
      } else if (platform === 'gitlab') {
        color = 'var(--color-gitlab)';
        gradId = 'gradient-gitlab';
      } else if (platform === 'bitbucket') {
        color = 'var(--color-bitbucket)';
        gradId = 'gradient-bitbucket';
      } else if (platform === 'local') {
        color = 'var(--color-local)';
        gradId = 'gradient-local';
      } else if (platform === 'codeberg') {
        color = 'var(--color-codeberg)';
        gradId = 'gradient-codeberg';
      } else if (platform === 'azure') {
        color = 'var(--color-azure)';
        gradId = 'gradient-azure';
      }
    }

    return { chartColor: color, gradientId: gradId };
  }, [platformFilters]);

  // 2. Extrai e consolida os commits dos últimos 30 dias (sempre com base na data atual)
  const chartData = useMemo(() => {
    const points = [];
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = 30; i >= 0; i--) {
      const d = new Date(endDate);
      d.setDate(endDate.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = String(d.getDate());

      // Lê do dailyCommits, aplicando os filtros
      const rawCommits = dailyCommits[dateStr] || {
        total: 0,
        github: 0,
        gitlab: 0,
        bitbucket: 0,
        codeberg: 0,
        local: 0,
        azure: 0,
      };

      const gh = platformFilters.github ? rawCommits.github : 0;
      const gl = platformFilters.gitlab ? rawCommits.gitlab : 0;
      const bb = platformFilters.bitbucket ? rawCommits.bitbucket : 0;
      const cb = platformFilters.codeberg ? rawCommits.codeberg : 0;
      const lc = platformFilters.local ? rawCommits.local : 0;
      const az = platformFilters.azure ? rawCommits.azure || 0 : 0;

      const totalFiltered = gh + gl + bb + cb + lc + az;

      points.push({
        date: d,
        dateStr,
        label: dayLabel,
        count: totalFiltered,
        breakdown: {
          total: totalFiltered,
          github: gh,
          gitlab: gl,
          bitbucket: bb,
          codeberg: cb,
          local: lc,
          azure: az,
        },
      });
    }
    return points;
  }, [dailyCommits, platformFilters]);

  // 3. Calcula o valor máximo do eixo Y
  const maxCount = useMemo(() => {
    const maxVal = Math.max(...chartData.map((p) => p.count), 0);
    if (maxVal === 0) return 10;
    // Arredonda para cima no próximo múltiplo de 5
    return Math.ceil(maxVal / 5) * 5;
  }, [chartData]);

  // Dimensões do Gráfico SVG
  const width = 1000;
  const height = 320;
  const paddingLeft = 55;
  const paddingRight = 30;
  const paddingTop = 35;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // 4. Mapeia os dados para coordenadas (x, y)
  const pointsWithCoords = useMemo(() => {
    return chartData.map((p, idx) => {
      const x = paddingLeft + (idx / 30) * chartWidth;
      const y = height - paddingBottom - (p.count / maxCount) * chartHeight;
      return {
        ...p,
        x,
        y,
      };
    });
  }, [chartData, maxCount, chartWidth, chartHeight]);

  // 5. Gera o path da linha usando Cubic Bezier Spline
  const linePath = useMemo(() => {
    if (pointsWithCoords.length === 0) return '';
    let d = `M ${pointsWithCoords[0].x} ${pointsWithCoords[0].y}`;

    for (let i = 0; i < pointsWithCoords.length - 1; i++) {
      const curr = pointsWithCoords[i];
      const next = pointsWithCoords[i + 1];
      const prev = pointsWithCoords[i - 1] || curr;
      const next2 = pointsWithCoords[i + 2] || next;

      // Fator de suavização
      const smoothing = 0.18;

      // Distância em X
      const dx = next.x - curr.x;

      // Tangentes/Slopes
      let slopeCurr = (next.y - prev.y) / (next.x - prev.x || 1);
      let slopeNext = (next2.y - curr.y) / (next2.x - curr.x || 1);

      // Se ambos os pontos adjacentes possuem a mesma quantidade de commits, a linha
      // entre eles deve ser horizontal para evitar ondulações bizarras/Runge's overshoot.
      if (curr.count === next.count) {
        slopeCurr = 0;
        slopeNext = 0;
      }

      // Se o ponto atual ou o próximo forem picos ou vales (extremos locais),
      // achatamos as tangentes correspondentes para um visual ultra limpo e preciso.
      if (
        (curr.count > prev.count && curr.count > next.count) ||
        (curr.count < prev.count && curr.count < next.count)
      ) {
        slopeCurr = 0;
      }
      if (
        (next.count > curr.count && next.count > next2.count) ||
        (next.count < curr.count && next.count < next2.count)
      ) {
        slopeNext = 0;
      }

      // Pontos de controle
      const cpX1 = curr.x + dx * smoothing;
      const cpY1 = curr.y + slopeCurr * dx * smoothing;

      const cpX2 = next.x - dx * smoothing;
      const cpY2 = next.y - slopeNext * dx * smoothing;

      // Garante limites no Y para não vazar a grade
      const clampY = (val: number) =>
        Math.max(paddingTop, Math.min(height - paddingBottom, val));

      d += ` C ${cpX1} ${clampY(cpY1)}, ${cpX2} ${clampY(cpY2)}, ${next.x} ${next.y}`;
    }
    return d;
  }, [pointsWithCoords]);

  // 6. Path para a área preenchida
  const areaPath = useMemo(() => {
    if (pointsWithCoords.length === 0) return '';
    const first = pointsWithCoords[0];
    const last = pointsWithCoords[pointsWithCoords.length - 1];
    return `${linePath} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`;
  }, [linePath, pointsWithCoords]);

  // 7. Configura os Ticks do Eixo Y (5 divisões)
  const yTicks = useMemo(() => {
    const ticks = [];
    const step = maxCount / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(Math.round(step * i));
    }
    return ticks;
  }, [maxCount]);

  const handleMouseEnterPoint = (_e: React.MouseEvent<SVGCircleElement>, p: any) => {
    const dateObj = new Date(p.dateStr + 'T12:00:00.000Z');
    const formattedDate = dateObj.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    setHoveredPoint({
      ...p,
      formattedDate,
    });
  };

  const handleMouseLeavePoint = () => {
    setHoveredPoint(null);
  };

  // Se o ano selecionado não tiver commits e tudo estiver vazio
  const totalCommitsCount = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.count, 0);
  }, [chartData]);

  return (
    <section className="glass-panel heatmap-section commit-line-chart-section">
      <div className="heatmap-header">
        <h3 className="section-title">Ritmo de Atividade (Últimos 30 Dias)</h3>
        <span className="total-commits-badge">
          {totalCommitsCount} commits no período
        </span>
      </div>

      {/* QUADRO INFORMATIVO FIXO NO TOPO */}
      <div className="chart-info-box">
        {hoveredPoint ? (
          <div className="info-box-active animate-fade-in">
            <div className="info-box-left">
              <span className="info-date">{hoveredPoint.formattedDate}</span>
              <span className="info-total">
                <Activity size={14} style={{ color: chartColor, marginRight: '6px' }} />
                <strong>{hoveredPoint.count}</strong> {hoveredPoint.count === 1 ? 'commit' : 'commits'}
              </span>
            </div>
            <div className="info-box-right">
              {hoveredPoint.breakdown.github > 0 && (
                <span className="info-badge github">
                  <span className="badge-dot github"></span>GitHub: <strong>{hoveredPoint.breakdown.github}</strong>
                </span>
              )}
              {hoveredPoint.breakdown.gitlab > 0 && (
                <span className="info-badge gitlab">
                  <span className="badge-dot gitlab"></span>GitLab: <strong>{hoveredPoint.breakdown.gitlab}</strong>
                </span>
              )}
              {hoveredPoint.breakdown.bitbucket > 0 && (
                <span className="info-badge bitbucket">
                  <span className="badge-dot bitbucket"></span>Bitbucket: <strong>{hoveredPoint.breakdown.bitbucket}</strong>
                </span>
              )}
              {hoveredPoint.breakdown.codeberg > 0 && (
                <span className="info-badge codeberg">
                  <span className="badge-dot codeberg"></span>Codeberg: <strong>{hoveredPoint.breakdown.codeberg}</strong>
                </span>
              )}
              {hoveredPoint.breakdown.local > 0 && (
                <span className="info-badge local">
                  <span className="badge-dot local"></span>Local: <strong>{hoveredPoint.breakdown.local}</strong>
                </span>
              )}
              {hoveredPoint.breakdown.azure > 0 && (
                <span className="info-badge azure">
                  <span className="badge-dot azure"></span>Azure: <strong>{hoveredPoint.breakdown.azure}</strong>
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="info-box-placeholder">
            <Activity size={14} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
            <span>Passe o cursor sobre os pontos para ver o detalhamento de commits de cada dia</span>
          </div>
        )}
      </div>

      <div className="heatmap-wrapper chart-wrapper" style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="heatmap-svg commit-line-chart-svg">
          {/* DEFINIÇÕES DE GRADIENTES E FILTROS */}
          <defs>
            {/* Gradiente do preenchimento sob a curva */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={chartColor} stopOpacity="0.00" />
            </linearGradient>

            {/* Filtro de glow para a linha */}
            <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* LINHAS DE GRADE HORIZONTAIS */}
          {yTicks.map((tick) => {
            const yCoord = height - paddingBottom - (tick / maxCount) * chartHeight;
            return (
              <g key={tick} className="chart-grid-group">
                <line
                  x1={paddingLeft}
                  y1={yCoord}
                  x2={width - paddingRight}
                  y2={yCoord}
                  className="chart-grid-line"
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4,4"
                />
                <text
                  x={paddingLeft - 15}
                  y={yCoord + 3}
                  textAnchor="end"
                  className="chart-axis-label"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* LINHAS DE GRADE VERTICAIS E RÓTULOS DO EIXO X */}
          {pointsWithCoords.map((p, idx) => {
            // Desenha apenas 1 a cada 2 linhas de grade/rótulos em telas menores para melhor legibilidade
            const shouldShowLabel = idx % 2 === 0 || idx === 30;
            return (
              <g key={idx}>
                {shouldShowLabel && (
                  <line
                    x1={p.x}
                    y1={paddingTop}
                    x2={p.x}
                    y2={height - paddingBottom}
                    className="chart-grid-line"
                    stroke="rgba(255,255,255,0.03)"
                    strokeDasharray="4,4"
                  />
                )}
                {shouldShowLabel && (
                  <text
                    x={p.x}
                    y={height - paddingBottom + 20}
                    textAnchor="middle"
                    className="chart-axis-label"
                  >
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* ÁREA PREENCHIDA COM GRADIENTE */}
          {totalCommitsCount > 0 && pointsWithCoords.length > 0 && (
            <path d={areaPath} fill={`url(#${gradientId})`} className="chart-area-fill" />
          )}

          {/* LINHA DO GRÁFICO (CURVA SUAVE) */}
          {totalCommitsCount > 0 && pointsWithCoords.length > 0 && (
            <path
              d={linePath}
              fill="none"
              stroke={chartColor}
              strokeWidth="2.5"
              filter="url(#neon-glow)"
              className="chart-line"
            />
          )}

          {/* PONTOS DE DADOS (MARKERS) COM EFEITO HOVER */}
          {pointsWithCoords.map((p, idx) => {
            const isHovered = hoveredPoint && hoveredPoint.dateStr === p.dateStr;
            return (
              <g key={idx} style={{ '--idx': idx } as React.CSSProperties}>
                {/* Marcador invisível maior para facilitar hover do mouse */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="12"
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => handleMouseEnterPoint(e, p)}
                  onMouseLeave={handleMouseLeavePoint}
                />
                {/* Marcador real visível */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? "5" : "3.5"}
                  fill="#ffffff"
                  stroke={chartColor}
                  strokeWidth={isHovered ? "2.5" : "1.5"}
                  className="chart-marker"
                  style={{ pointerEvents: 'none' }}
                />
                {/* Efeito Glow Pulsar no hover */}
                {isHovered && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="10"
                    fill="none"
                    stroke={chartColor}
                    strokeWidth="1.5"
                    opacity="0.5"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* EIXO LABELS DE TÍTULO */}
        <div className="chart-y-axis-title">Contribuições</div>
        <div className="chart-x-axis-title">Dias</div>
      </div>
    </section>
  );
}
