import React from 'react';

type CursorLogoProps = {
  className?: string;
};

const CursorLogo = ({ className = 'w-5 h-5' }: CursorLogoProps) => {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icons/cursor.svg`}
      alt="Cursor"
      className={className}
    />
  );
};

export default CursorLogo;
