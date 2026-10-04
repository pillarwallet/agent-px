import { NotificationBing, ShieldTick } from 'iconsax-react';
import { useState } from 'react';
import styled from 'styled-components';

type AutomationsModalProps = {
  isContentVisible: boolean;
};

type AutomationView = 'alerts' | 'policies';

const Content = styled.section`
  width: 100%;
  color: #ffffff;
  font-family: inherit;
`;

const Header = styled.header`
  text-align: left;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
`;

const Subtitle = styled.p`
  margin: 6px 0 0;
  color: #a9a5b3;
  font-size: 13px;
  line-height: 1.4;
  letter-spacing: 0;
`;

const Tabs = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 20px;
  padding: 3px;
  border: 1px solid #2e2938;
  border-radius: 8px;
  background: #111014;
`;

const Tab = styled.button<{ $active: boolean }>`
  min-height: 38px;
  border: 0;
  border-radius: 6px;
  background: ${({ $active }) => ($active ? '#24202d' : 'transparent')};
  color: ${({ $active }) => ($active ? '#ffffff' : '#8f8b96')};
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  cursor: pointer;
`;

const EmptyState = styled.div`
  min-height: 190px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 12px 16px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #241d3a;
  color: #a78bfa;
`;

const EmptyTitle = styled.h3`
  margin: 14px 0 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0;
`;

const EmptyText = styled.p`
  max-width: 270px;
  margin: 7px 0 0;
  color: #96919f;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0;
`;

const AutomationsModal = ({ isContentVisible }: AutomationsModalProps) => {
  const [view, setView] = useState<AutomationView>('alerts');
  const isAlertsView = view === 'alerts';

  return (
    <Content aria-hidden={!isContentVisible}>
      <Header>
        <Title>Automations</Title>
        <Subtitle>Monitor markets and automate token purchases.</Subtitle>
      </Header>

      <Tabs aria-label="Automation sections">
        <Tab
          type="button"
          $active={isAlertsView}
          onClick={() => setView('alerts')}
        >
          Alerts
        </Tab>
        <Tab
          type="button"
          $active={!isAlertsView}
          onClick={() => setView('policies')}
        >
          Policies
        </Tab>
      </Tabs>

      <EmptyState>
        <EmptyIcon>
          {isAlertsView ? (
            <NotificationBing size={25} />
          ) : (
            <ShieldTick size={25} />
          )}
        </EmptyIcon>
        <EmptyTitle>
          {isAlertsView ? 'No alerts yet' : 'No policies yet'}
        </EmptyTitle>
        <EmptyText>
          {isAlertsView
            ? 'Create an alert to buy a token when your price condition is met.'
            : 'Create a policy to set the budget and providers your alerts can use.'}
        </EmptyText>
      </EmptyState>
    </Content>
  );
};

export default AutomationsModal;
