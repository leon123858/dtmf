'use client';

import React, { useState } from 'react';
import { SideBar } from './SideBar';

interface SimpleHeaderProps {
	name: string;
}

export const Header: React.FC<SimpleHeaderProps> = ({ name }) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<header className='flex justify-between items-center py-4'>
			<SideBar isOpen={isOpen} setIsOpen={setIsOpen} name={name} />
		</header>
	);
};
