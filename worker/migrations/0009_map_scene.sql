-- Which scene a map's companion stage draws: the balloon-head scout and robot crew (NULL, the default),
-- or the rabbit's burrow for rabbit-hole maps. It lives on the HOME note, so it travels with the map.

ALTER TABLE notes ADD COLUMN scene TEXT;
