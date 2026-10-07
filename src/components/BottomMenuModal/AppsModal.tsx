/* eslint-disable @typescript-eslint/no-use-before-define */
import styled from 'styled-components';
import { useLayoutEffect, useRef } from 'react';

// components
import AppsList from '../AppsList';

interface AppsModalProps {
  isContentVisible?: boolean; // for animation purpose to not render rest of content and return main wrapper only
}

const AppsModal = ({ isContentVisible }: AppsModalProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (isContentVisible) scrollRef.current?.scrollTo({ top: 0 });
  }, [isContentVisible]);

  if (!isContentVisible) return <DefaultWrapper />;

  return <AppsList ref={scrollRef} isModal />;
};

const DefaultWrapper = styled.div`
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
`;

export default AppsModal;
