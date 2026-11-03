import type { UserEditCommand } from './cache';

type FavoriteInput = { userId: string; tripId: string };

export function editUser({ userId }: { userId: string }, edit: UserEditCommand['edit']): UserEditCommand {
	return { type: 'user.edit', userId, edit };
}

export function patchProfile({ userId, name }: { userId: string; name: string | null }): UserEditCommand {
	return editUser({ userId }, user => { if (user) user.name = name; });
}

export function upsertFavorite(input: FavoriteInput & { name: string; lastViewedAt: string }): UserEditCommand {
	return editUser(input, (user, names) => {
		if (!user) return;
		const fields = { name: names.nameFor(input.tripId) ?? input.name, lastViewedAt: input.lastViewedAt };
		const favorite = user.subscribedTrips.find(trip => trip.id === input.tripId);
		if (favorite) Object.assign(favorite, fields);
		else user.subscribedTrips.push({ __typename: 'SubscribedTrip', id: input.tripId, ...fields });
	});
}

export function removeFavorite(input: FavoriteInput): UserEditCommand {
	return editUser(input, user => {
		if (user) user.subscribedTrips = user.subscribedTrips.filter(trip => trip.id !== input.tripId);
	});
}

export function touchFavorite(input: FavoriteInput & { lastViewedAt: string }): UserEditCommand {
	return editUser(input, user => {
		const favorite = user?.subscribedTrips.find(trip => trip.id === input.tripId);
		if (favorite) favorite.lastViewedAt = input.lastViewedAt;
	});
}

export function renameFavorite(input: FavoriteInput & { name: string }): UserEditCommand {
	return editUser(input, (user, names) => {
		names.rememberName(input.tripId, input.name);
		const favorite = user?.subscribedTrips.find(trip => trip.id === input.tripId);
		if (favorite) favorite.name = input.name;
	});
}
