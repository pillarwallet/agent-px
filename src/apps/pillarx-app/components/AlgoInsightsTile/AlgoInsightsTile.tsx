import React from 'react';
import styled from 'styled-components';
import TileContainer from '../TileContainer/TileContainer';
import { Projection, AlgoInsightsData } from '../../../../types/api';
import AlgoInsightsLogo from './AlgoInsightsLogo';

type AlgoInsightsTileProps = {
  data: Projection;
  isDataLoading: boolean;
};

const AlgoInsightsTile: React.FC<AlgoInsightsTileProps> = ({ data, isDataLoading }) => {
  const [selectedTimeframe, setSelectedTimeframe] = React.useState<'1w' | '1m' | '3m' | '6m'>('6m');

  if (isDataLoading) return null;

  const algoData = data.data as AlgoInsightsData;

  // Fallback if data is missing (shouldn't happen with correct mock/API)
  if (!algoData) return null;

  // Helper function to generate smooth curve path using Catmull-Rom spline
  const generateSmoothPath = (points: { timestamp: number; value: number }[], width: number, height: number, minValue: number, maxValue: number): string => {
    if (points.length === 0) return '';

    const range = maxValue - minValue || 1; // Avoid division by zero
    const xStep = width / (points.length - 1);

    // Convert data points to SVG coordinates
    const coords = points.map((point, index) => ({
      x: index * xStep,
      y: height - ((point.value - minValue) / range) * height
    }));

    if (coords.length < 2) return `M${coords[0].x},${coords[0].y}`;

    // Generate smooth curve using cubic bezier
    let path = `M${coords[0].x},${coords[0].y}`;

    for (let i = 0; i < coords.length - 1; i++) {
      const current = coords[i];
      const next = coords[i + 1];

      // Calculate control points for smooth curve
      const cp1x = current.x + (next.x - current.x) / 3;
      const cp1y = current.y;
      const cp2x = current.x + 2 * (next.x - current.x) / 3;
      const cp2y = next.y;

      path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
    }

    return path;
  };

  // Generate filled area path (for gradient)
  const generateFilledPath = (linePath: string, width: number, height: number): string => {
    return `${linePath} L${width},${height} L0,${height} Z`;
  };

  // Format date labels based on timeframe
  const formatDateLabel = (timestamp: number, timeframe: string): string => {
    const date = new Date(timestamp * 1000);
    if (timeframe === '1w') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (timeframe === '1m') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (timeframe === '3m') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  };

  // Get current timeframe data
  const currentTimeframeData = algoData.cumulative_pnl[selectedTimeframe];
  const graphWidth = 700; // Reduced from 718 to account for margins
  const graphHeight = 260; // Reduced from 272 to account for bottom margin

  // Calculate min/max for scaling with padding
  const values = currentTimeframeData.history.map(p => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const padding = (dataMax - dataMin) * 0.1; // 10% padding
  const minValue = dataMin - padding;
  const maxValue = dataMax + padding;

  // Generate paths
  const linePath = generateSmoothPath(currentTimeframeData.history, graphWidth, graphHeight, minValue, maxValue);
  const filledPath = generateFilledPath(linePath, graphWidth, graphHeight);

  // Get last point for current value indicator
  const lastIndex = currentTimeframeData.history.length - 1;
  const lastPoint = currentTimeframeData.history[lastIndex];
  const xStep = graphWidth / (currentTimeframeData.history.length - 1);
  const lastX = lastIndex * xStep; // Use actual position instead of graphWidth
  const lastY = graphHeight - ((lastPoint.value - minValue) / (maxValue - minValue)) * graphHeight;

  // Generate Y-axis labels
  const yAxisSteps = 6;
  const yAxisLabels = Array.from({ length: yAxisSteps }, (_, i) => {
    const value = maxValue - (i * (maxValue - minValue) / (yAxisSteps - 1));
    return `${Math.round(value)}%`;
  });

  // Generate date labels (show 5 evenly spaced labels)
  const dateLabels = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const index = Math.floor(ratio * (currentTimeframeData.history.length - 1));
    return {
      position: ratio * 100,
      label: formatDateLabel(currentTimeframeData.history[index].timestamp, selectedTimeframe)
    };
  });

  return (
    <StyledTileContainer>
      {/* ================= MOBILE VIEW ================= */}
      <MobileView>
        <MobileHeader>
          <LogoContainerMobile>
            <AlgoInsightsLogo />
          </LogoContainerMobile>
          <MobileTitle>PillarX Algorithmic Insights</MobileTitle>
        </MobileHeader>

        <MobileDescriptionBox>
          Receive algorithmic event data including indicative entry, stop, and profit thresholds
        </MobileDescriptionBox>

        <MobileGrid>
          {/* 1 Month PnL */}
          <MobileMetricCard>
            <MobileMetricTitle>1 Month PnL</MobileMetricTitle>
            <MobileMetricValueBadge>
              {algoData.pnl_1m}% <SmallArrowUp>▲</SmallArrowUp>
            </MobileMetricValueBadge>
          </MobileMetricCard>

          {/* 3 Month PnL */}
          <MobileMetricCard>
            <MobileMetricTitle>3 Month PnL</MobileMetricTitle>
            <MobileMetricValueBadge>
              {algoData.pnl_3m}% <SmallArrowUp>▲</SmallArrowUp>
            </MobileMetricValueBadge>
          </MobileMetricCard>

          {/* 6 Month PnL */}
          <MobileMetricCard>
            <MobileMetricTitle>6 Month PnL</MobileMetricTitle>
            <MobileMetricValueBadge>
              {algoData.pnl_6m}% <SmallArrowUp>▲</SmallArrowUp>
            </MobileMetricValueBadge>
          </MobileMetricCard>

          {/* Risk Gauge */}
          <MobileMetricCard>
            <RiskGaugeContainer>
              <RiskGaugeSVG viewBox="0 0 120 70">
                {/* Gauge Segments */}
                <path d="M10,60 A50,50 0 0,1 25,25" fill="none" stroke="#5CFF93" strokeWidth="12" strokeLinecap="round" />
                <path d="M28,22 A50,50 0 0,1 60,10" fill="none" stroke="#E3D67F" strokeWidth="12" strokeLinecap="round" />
                <path d="M64,10 A50,50 0 0,1 92,22" fill="none" stroke="#E89D38" strokeWidth="12" strokeLinecap="round" />
                <path d="M95,25 A50,50 0 0,1 110,60" fill="none" stroke="#8A77FF" strokeWidth="12" strokeLinecap="round" />
                <path d="M110,60 A50,50 0 0,1 110,65" fill="none" stroke="#FF366C" strokeWidth="12" strokeLinecap="round" />

                {/* Needle Base */}
                <circle cx="60" cy="60" r="4" fill="#1E1D24" stroke="#5CFF93" strokeWidth="2" />
                {/* Needle Indicator (pointing to low risk/green) */}
                <circle cx="18" cy="50" r="6" fill="#5CFF93" stroke="#1E1D24" strokeWidth="2" />
              </RiskGaugeSVG>
              <RiskLabel>{algoData.risk_level}</RiskLabel>
            </RiskGaugeContainer>
          </MobileMetricCard>
        </MobileGrid>

        <MobileFooter>
          <DisclaimerRow>
            <InfoIcon>!</InfoIcon>
            <DisclaimerText>For informational use only - not financial advice</DisclaimerText>
          </DisclaimerRow>
          <MobileCTAButton onClick={() => window.location.href = '/insights'}>
            Start free 7 day trial
          </MobileCTAButton>
        </MobileFooter>
      </MobileView>

      {/* ================= DESKTOP VIEW ================= */}
      <DesktopView>
        <HeaderSection>
          <HeaderLeft>
            <LogoContainer>
              <AlgoInsightsLogo />
            </LogoContainer>
            <HeaderTextContainer>
              <HeaderTitle>PillarX Algorithmic Insights</HeaderTitle>
              <HeaderSubtitle>Receive algorithmic event data including indicative entry, stop, and profit thresholds</HeaderSubtitle>
            </HeaderTextContainer>
          </HeaderLeft>
          <BuyButtonContainer>
            <BuyButton onClick={() => window.location.href = '/insights'}>
              <BuyText>Start free 7 day trial</BuyText>
            </BuyButton>
          </BuyButtonContainer>
        </HeaderSection>

        <ContentSection>
          <LeftColumn>
            {/* Performance Container */}
            <PerformanceContainer>
              <PerformanceMetricsContainer>
                {/* 1 Month PnL */}
                <PerformanceMetric>
                  <PerformanceMetricTitle>1 Month PnL</PerformanceMetricTitle>
                  <PerformanceMetricValueContainer>
                    <PerformanceMetricValue>{algoData.pnl_1m}%</PerformanceMetricValue>
                    <PolygonIcon />
                  </PerformanceMetricValueContainer>
                </PerformanceMetric>

                {/* 3 Month PnL */}
                <PerformanceMetric>
                  <PerformanceMetricTitle>3 Month PnL</PerformanceMetricTitle>
                  <PerformanceMetricValueContainer>
                    <PerformanceMetricValue>{algoData.pnl_3m}%</PerformanceMetricValue>
                    <PolygonIcon />
                  </PerformanceMetricValueContainer>
                </PerformanceMetric>

                {/* 6 Month PnL */}
                <PerformanceMetric>
                  <PerformanceMetricTitle>6 Month PnL</PerformanceMetricTitle>
                  <PerformanceMetricValueContainer>
                    <PerformanceMetricValue>{algoData.pnl_6m}%</PerformanceMetricValue>
                    <PolygonIcon />
                  </PerformanceMetricValueContainer>
                </PerformanceMetric>
              </PerformanceMetricsContainer>

              {/* Risk Level Indicator */}
              <RiskLevelContainer>
                <RiskLevelTitle>{algoData.risk_level}</RiskLevelTitle>
                <RiskLevelIndicatorContainer>
                  <RiskLevelIndicator />
                  <RiskLevelGradient />
                  <RiskLevelPointer />
                </RiskLevelIndicatorContainer>
              </RiskLevelContainer>
            </PerformanceContainer>

            {/* Profile Container (PnL Status) */}
            <ProfileContainer>
              <ProfileTitle>PnL status</ProfileTitle>
              <DonutChartSVG viewBox="0 0 190 190">
                {/* Winning: 54% (Green) */}
                <circle cx="95" cy="95" r="80" fill="none" stroke="#5CFF93" strokeWidth="20" strokeDasharray="271.4 502.6" strokeDashoffset="0" transform="rotate(-90 95 95)" />
                {/* Losing: 27.4% (Red) */}
                <circle cx="95" cy="95" r="80" fill="none" stroke="#FF366C" strokeWidth="20" strokeDasharray="137.7 502.6" strokeDashoffset="-271.4" transform="rotate(-90 95 95)" />
                {/* Neutral: 18.6% (Purple) */}
                <circle cx="95" cy="95" r="80" fill="none" stroke="#8A77FF" strokeWidth="20" strokeDasharray="93.5 502.6" strokeDashoffset="-409.1" transform="rotate(-90 95 95)" />
              </DonutChartSVG>

              <LegendContainer>
                <LegendItem>
                  <LegendDot color="#5CFF93" />
                  <LegendText>Winning: {algoData.pnl_status.winning}% Trades</LegendText>
                </LegendItem>
                <LegendItem>
                  <LegendDot color="#FF366C" />
                  <LegendText>Losing: {algoData.pnl_status.losing}% Trades</LegendText>
                </LegendItem>
                <LegendItem>
                  <LegendDot color="#8A77FF" />
                  <LegendText>Neutral: {algoData.pnl_status.neutral}% Trades</LegendText>
                </LegendItem>
              </LegendContainer>
            </ProfileContainer>
          </LeftColumn>

          {/* Cumulative PnL Container */}
          <CumulativePnLContainer>
            <TimeframeButtonsContainer>
              <TimeframeButton
                active={selectedTimeframe === '1w'}
                onClick={() => setSelectedTimeframe('1w')}
              >
                1w
              </TimeframeButton>
              <TimeframeButton
                active={selectedTimeframe === '1m'}
                onClick={() => setSelectedTimeframe('1m')}
              >
                1m
              </TimeframeButton>
              <TimeframeButton
                active={selectedTimeframe === '3m'}
                onClick={() => setSelectedTimeframe('3m')}
              >
                3m
              </TimeframeButton>
              <TimeframeButton
                active={selectedTimeframe === '6m'}
                onClick={() => setSelectedTimeframe('6m')}
              >
                6m
              </TimeframeButton>
            </TimeframeButtonsContainer>

            <GraphHeader>
              <GraphTitle>Cumulative PnL</GraphTitle>
              <GraphValueContainer>
                <GraphValue>{algoData.cumulative_pnl['6m'].value}%</GraphValue>
                <PolygonIconLarge />
              </GraphValueContainer>
            </GraphHeader>

            <GraphContainer>
              {/* Grid Lines */}
              <GridLine style={{ left: '0%' }} />
              <GridLine style={{ left: '20%' }} />
              <GridLine style={{ left: '40%' }} />
              <GridLine style={{ left: '60%' }} />
              <GridLine style={{ left: '80%' }} />
              <GridLine style={{ left: '100%' }} />

              {/* Y-Axis Labels */}
              <YAxisLabels>
                {yAxisLabels.map((label, index) => (
                  <YAxisLabel key={index}>{label}</YAxisLabel>
                ))}
              </YAxisLabels>

              {/* Chart Area */}
              <ChartArea>
                <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(92, 255, 147, 0.3)" />
                      <stop offset="100%" stopColor="rgba(30, 29, 36, 0)" />
                    </linearGradient>
                  </defs>

                  {/* Filled area with gradient */}
                  <path d={filledPath} fill="url(#chartGradient)" />

                  {/* Line path */}
                  <path d={linePath} fill="none" stroke="#FFFFFF" strokeWidth="2" />

                  {/* Current Value Dot */}
                  <circle cx={lastX} cy={lastY} r="4" fill="#FFFFFF" stroke="#1E1D24" strokeWidth="1" />
                  <line x1={lastX} y1={lastY} x2={lastX} y2={graphHeight} stroke="#FFFFFF" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                </svg>
              </ChartArea>

              {/* Date Labels */}
              <DateLabels>
                {dateLabels.map((item, index) => (
                  <DateLabel key={index} style={{ left: `${item.position}%` }}>
                    {item.label}
                  </DateLabel>
                ))}
              </DateLabels>
            </GraphContainer>
          </CumulativePnLContainer>
        </ContentSection>
      </DesktopView>
    </StyledTileContainer>
  );
};

export default AlgoInsightsTile;

// ================= STYLED COMPONENTS =================

const StyledTileContainer = styled(TileContainer)`
  width: 100%;
  min-height: 620px;
  background: linear-gradient(0deg, #1E1D24, #1E1D24), #1E1D24;
  border-radius: 24px;
  padding: 36px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 24px;

  @media (max-width: 768px) {
    padding: 16px;
    gap: 16px;
    min-height: auto;
    background: #1E1D24; /* Darker background for mobile */
  }
`;

// ================= VIEW TOGGLES =================

const MobileView = styled.div`
  display: none;
  flex-direction: column;
  gap: 12px;
  width: 100%;

  @media (max-width: 768px) {
    display: flex;
  }
`;

const DesktopView = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  flex: 1;

  @media (max-width: 768px) {
    display: none;
  }
`;

// ================= MOBILE COMPONENTS =================

const MobileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 0;
`;

const LogoContainerMobile = styled.div`
  width: 48px;
  height: 48px;
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  
  img {
    width: 48px;
    height: 48px;
    object-fit: contain;
  }
`;

const MobileTitle = styled.h2`
  font-family: 'Poppins';
  font-weight: 600;
  font-size: 18px;
  line-height: 24px;
  color: #FFFFFF;
  margin: 0;
`;

const MobileDescriptionBox = styled.div`
  background: rgba(18, 17, 22, 0.5);
  border-radius: 10px;
  padding: 16px;
  font-family: 'Poppins';
  font-weight: 400;
  font-size: 14px;
  line-height: 20px;
  color: #FFFFFF;
  opacity: 0.8;
`;

const MobileGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const MobileMetricCard = styled.div`
  background: #1E1D24;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100px;
  border: 1px solid rgba(255, 255, 255, 0.05);
`;

const MobileMetricTitle = styled.div`
  font-family: 'Poppins';
  font-size: 14px;
  color: #FFFFFF;
  margin-bottom: 8px;
`;

const MobileMetricValueBadge = styled.div`
  background: rgba(92, 255, 147, 0.1);
  border-radius: 8px;
  padding: 4px 12px;
  color: #5CFF93;
  font-family: 'Poppins';
  font-weight: 500;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
`;

const SmallArrowUp = styled.span`
  font-size: 10px;
`;

const RiskGaugeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const RiskGaugeSVG = styled.svg`
  width: 100%;
  height: auto;
  max-width: 120px;
`;

const RiskLabel = styled.div`
  font-family: 'Poppins';
  font-size: 12px;
  color: #5CFF93;
  margin-top: 4px;
`;

const MobileFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 8px;
`;

const DisclaimerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.5;
`;

const InfoIcon = styled.div`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #FFFFFF;
`;

const DisclaimerText = styled.span`
  font-family: 'Poppins';
  font-size: 12px;
  color: #FFFFFF;
`;

const MobileCTAButton = styled.button`
  width: 100%;
  height: 48px;
  background: #8A77FF;
  border-radius: 12px;
  border: none;
  font-family: 'Poppins';
  font-weight: 500;
  font-size: 16px;
  color: #FFFFFF;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

// ================= DESKTOP COMPONENTS (Existing) =================

// Header
const HeaderSection = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  height: 48px;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const LogoContainer = styled.div`
  width: 60px;
  height: 60px;
  background: radial-gradient(50% 50% at 50% 100%, rgba(92, 255, 147, 0.4) 0%, rgba(92, 255, 147, 0.01) 100%), rgba(18, 17, 22, 0.9);
  background-blend-mode: plus-lighter, normal;
  box-shadow: 0px 4.5px 12px rgba(0, 0, 0, 0.3), 0px 0px 0px 0.75px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(1.23077px);
  border-radius: 12px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  
  img {
    width: 60px;
    height: 60px;
    object-fit: contain;
  }
`;

const HeaderTextContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const HeaderTitle = styled.div`
  font-family: 'Poppins';
  font-weight: 500;
  font-size: 18px;
  line-height: 24px;
  letter-spacing: -0.02em;
  color: #FFFFFF;
`;

const HeaderSubtitle = styled.div`
  font-family: 'Poppins';
  font-weight: 400;
  font-size: 14px;
  line-height: 20px;
  letter-spacing: -0.02em;
  color: #FFFFFF;
  opacity: 0.5;
`;

const BuyButtonContainer = styled.div`
  height: 48px;
  background: #121116;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px;
`;

const BuyButton = styled.div`
  height: 40px;
  background: #8A77FF;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0 24px;
`;

const BuyText = styled.span`
  font-family: 'Poppins';
  font-weight: 400;
  font-size: 16px;
  line-height: 24px;
  letter-spacing: -0.02em;
  color: #FFFFFF;
  white-space: nowrap;
`;

// Content Layout
const ContentSection = styled.div`
  display: flex;
  gap: 24px;
  width: 100%;
  flex: 1;

  @media (max-width: 1024px) {
    flex-direction: column;
  }
`;

const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 424px;
  flex-shrink: 0;

  @media (max-width: 1024px) {
    width: 100%;
  }
`;

// Performance Container
const PerformanceContainer = styled.div`
  width: 100%;
  height: 200px;
  border: 1px solid #25232D;
  border-radius: 12px;
  padding: 16px 36px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-sizing: border-box;
`;

const PerformanceMetricsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PerformanceMetric = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

const PerformanceMetricTitle = styled.span`
  font-family: 'Poppins';
  font-weight: 400;
  font-size: 16px;
  line-height: 24px;
  letter-spacing: -0.02em;
  color: #FFFFFF;
`;

const PerformanceMetricValueContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(92, 255, 147, 0.1);
  border-radius: 6px;
  padding: 2px 8px;
`;

const PerformanceMetricValue = styled.span`
  font-family: 'Poppins';
  font-weight: 400;
  font-size: 16px;
  line-height: 24px;
  letter-spacing: -0.02em;
  color: #5CFF93;
`;

const PolygonIcon = () => (
  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
    <path d="M5 0L10 8H0L5 0Z" fill="#5CFF93" />
  </svg>
);

const RiskLevelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const RiskLevelTitle = styled.span`
  font-family: 'Poppins';
  font-weight: 400;
  font-size: 14px;
  line-height: 14px;
  letter-spacing: -0.02em;
  color: #5CFF93;
`;

const RiskLevelIndicatorContainer = styled.div`
  width: 100%;
  height: 16px;
  position: relative;
`;

const RiskLevelIndicator = styled.div`
  position: absolute;
  width: 100%;
  height: 8px;
  left: 0px;
  top: 4px;
  background: #2C2D33;
  border-radius: 4px;
`;

const RiskLevelGradient = styled.div`
  position: absolute;
  width: 100%;
  height: 8px;
  left: 0px;
  top: 4px;
  background: linear-gradient(90deg, #5CFF93 0%, #FFEA72 50%, #FF366C 100%);
  border-radius: 4px;
`;

const RiskLevelPointer = styled.div`
  position: absolute;
  width: 8px;
  height: 8px;
  left: 20px;
  top: 4px;
  background: #5CFF93;
  border: 3px solid #1E1D24;
  border-radius: 50%;
`;

// Profile Container (PnL Status)
const ProfileContainer = styled.div`
  width: 100%;
  height: 252px;
  border: 1px solid #25232D;
  border-radius: 12px;
  position: relative;
`;

const ProfileTitle = styled.div`
  position: absolute;
  left: 16px;
  top: 16px;
  font-family: 'Poppins';
  font-weight: 400;
  font-size: 14px;
  line-height: 14px;
  letter-spacing: -0.02em;
  color: #FFFFFF;
`;

const DonutChartSVG = styled.svg`
  position: absolute;
  width: 190px;
  height: 190px;
  left: 16px;
  top: 46px;
`;

const LegendContainer = styled.div`
  position: absolute;
  left: 230px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

const LegendDot = styled.div<{ color: string }>`
  width: 4px;
  height: 4px;
  background: ${props => props.color};
  border-radius: 50%;
  box-shadow: 0 0 0 2px ${props => props.color}40, 0 0 0 4px ${props => props.color}10;
  margin: 6px;
`;

const LegendText = styled.span`
  font-family: 'Poppins';
  font-weight: 400;
  font-size: 14px;
  line-height: 14px;
  letter-spacing: -0.02em;
  color: #FFFFFF;
`;

// Cumulative PnL Container
const CumulativePnLContainer = styled.div`
  flex: 1;
  height: 476px;
  border: 1px solid #25232D;
  border-radius: 12px;
  position: relative;

  @media (max-width: 1024px) {
    width: 100%;
    height: 400px;
  }
`;

const TimeframeButtonsContainer = styled.div`
  position: absolute;
  right: 16px;
  top: 16px;
  display: flex;
  gap: 6px;
`;

const TimeframeButton = styled.div<{ active?: boolean }>`
  padding: 4px 12px;
  background: ${props => props.active ? '#2E2A4A' : '#1E1D24'};
  border-radius: 5px;
  font-family: 'Poppins';
  font-size: 14px;
  color: #FFFFFF;
  opacity: ${props => props.active ? 1 : 0.5};
  cursor: pointer;
`;

const GraphHeader = styled.div`
  position: absolute;
  left: 16px;
  top: 16px;
`;

const GraphTitle = styled.div`
  font-family: 'Poppins';
  font-size: 16px;
  color: #FFFFFF;
  opacity: 0.5;
  margin-bottom: 4px;
`;

const GraphValueContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const GraphValue = styled.div`
  font-family: 'Poppins';
  font-weight: 500;
  font-size: 30px;
  color: #5CFF93;
`;

const PolygonIconLarge = () => (
  <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
    <path d="M8 0L16 10H0L8 0Z" fill="#5CFF93" rx="2" />
  </svg>
);

const GraphContainer = styled.div`
  position: absolute;
  left: 60px;
  right: 24px;
  top: 110px;
  height: 322px;

  @media (max-width: 1024px) {
    height: 250px;
    top: 100px;
  }
`;

const GridLine = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.05);
`;

const YAxisLabels = styled.div`
  position: absolute;
  left: -45px;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  width: 40px;
`;

const YAxisLabel = styled.div`
  font-family: 'Poppins';
  font-size: 10px;
  color: #FFFFFF;
  opacity: 0.3;
  text-align: right;
`;

const ChartArea = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
`;

const DateLabels = styled.div`
  position: absolute;
  bottom: -24px;
  left: 0;
  right: 0;
  height: 20px;
`;

const DateLabel = styled.div`
  position: absolute;
  transform: translateX(-50%);
  font-family: 'Poppins';
  font-size: 10px;
  color: #FFFFFF;
  opacity: 0.3;
  white-space: nowrap;
`;
