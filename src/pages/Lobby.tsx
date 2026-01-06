import React, { Suspense } from 'react';
import { animated, useSpring } from '@react-spring/web';
import styled from 'styled-components';

// components
const App = React.lazy(() => import('../apps/pillarx-app'));

const Lobby = () => {
  const [springs] = useSpring(() => ({
    from: { opacity: 0 },
    to: { opacity: 1 },
  }));
  return (
    <Wrapper>
      <animated.div
        style={{
          height: '100%',
          width: '100%',
          ...springs,
        }}
      >
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </animated.div>
    </Wrapper>
  );
};

const Wrapper = styled.div`
  display: flex;
  margin: 0 auto;
`;

export default Lobby;
