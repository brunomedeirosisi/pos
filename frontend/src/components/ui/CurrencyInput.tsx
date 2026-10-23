import React from 'react';
import { formatCurrencyInput, parseCurrencyInputToNumber } from '../../utils/number';

type CurrencyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
};

export function CurrencyInput(props: CurrencyInputProps): JSX.Element {
  const { value, onValueChange, inputMode = 'numeric', ...inputProps } = props;

  return (
    <input
      {...inputProps}
      type="text"
      inputMode={inputMode}
      value={formatCurrencyInput(value)}
      onChange={(event) => {
        onValueChange(parseCurrencyInputToNumber(event.target.value));
      }}
    />
  );
}
