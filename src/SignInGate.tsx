import React from "react";
import { Button, CircularProgress, Container, Stack, Typography } from "@mui/material";
import { GraphRepositoryContext } from "./GraphRepositoryContext";
import { hideSplash } from "./splash";

/* Holds the app back until we know where maps live, and asks for sign-in when the server needs it */
export function SignInGate({children}: {children: React.JSX.Element}) {
    const {status} = React.useContext(GraphRepositoryContext);
    // the loading screen in index.html covers the wait; lift it once we know where maps live
    React.useEffect(() => { if (status !== undefined) hideSplash(); }, [status]);
    if (status === undefined) {
        return (
            <Container sx={{height: '80svh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <CircularProgress/>
            </Container>
        );
    }
    if (status.mode === "signed-out") {
        return (
            <Container sx={{height: '80svh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Stack gap={3} alignItems="center">
                    <img src="/icon.svg" width={96} style={{borderRadius: 22}} alt=""/>
                    <Stack alignItems="center">
                        <Typography variant="h6">ADHD Assist</Typography>
                        <Typography variant="body2" color="text.secondary">You are here.</Typography>
                    </Stack>
                    <Typography color="text.secondary" textAlign="center">
                        Sign in to see your map on this device.
                    </Typography>
                    <Button variant="contained" href="/auth/login">Sign in with Google</Button>
                </Stack>
            </Container>
        );
    }
    return children;
}
