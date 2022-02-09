import React, { useEffect, useState } from "react";

export default function NumericInput (props) {

	console.log('numeric input', props)
	
	return (
		<input type="number" value={props.value} placeholder={props.name}/>
	);
}