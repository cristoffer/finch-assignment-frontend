import React, { useState } from "react";

export default function NumericInput ({ name, onChange, type, initialValue }) {
	const step = type === 'angle' ? 1 : 100;
	const [value, setValue] = useState(initialValue);

	const handleChange = e => {
		setValue(e.target.value);
		onChange(e)
	}
	
	return (
		<input 
			className="numericInput"
			name={name} 
			type="number" 
			step={step} 
			value={value} 
			placeholder={name} 
			min="0" 
			onChange={e => handleChange(e)}/>
	);
}