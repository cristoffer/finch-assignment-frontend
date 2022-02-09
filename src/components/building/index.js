import React, { useEffect, useState } from "react";

export default function Building (props) {
	
	return (
		<Group>
			<primitive
	            object={ props.buildingGeometry }
	            onClick={ e => console.log("onClick") }
	            onPointerOver={ e => console.log("onPointerOver") }
	            onPointerOut={ e => console.log("onPointerOut") } />;

	            </Group>
	);
}