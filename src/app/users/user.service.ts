import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, filter, Observable, tap } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Constants } from '../../constants';
import { User } from './user.dto';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  http = inject(HttpClient);

  public loggedInUser$ = new BehaviorSubject<User | null>(null);
  public selectedUser$ = new BehaviorSubject<User | null>(null);

  constructor() {
    const user = window.localStorage.getItem('user');
    if (user !== null) {
      this.loggedInUser$.next(JSON.parse(user));
    }

    this.loggedInUser$.pipe(filter((user) => !!user)).subscribe((user) => {
      window.localStorage.setItem('user', JSON.stringify(user));
    });
  }

  getUser(id: string): Observable<User> {
    return this.http.get<User>(Constants.API_URL + '/users/' + id).pipe(
      tap((user) => {
        this.selectedUser$.next(user);
      })
    );
  }

  login(email: string): Observable<User> {
    return this.http
      .get<User>(Constants.API_URL + '/users/login/' + email)
      .pipe(
        tap((user) => {
          this.loggedInUser$.next(user);
        })
      );
  }

  register(createUserDto: User): Observable<User> {
    return this.http
      .post<User>(
        Constants.API_URL + '/users',
        createUserDto,
        Constants.HTTP_OPTIONS
      )
      .pipe(tap((user) => this.loggedInUser$.next(user)));
  }

  update(id: string, updateUserDto: User) {
    return this.http
      .patch<User>(
        Constants.API_URL + '/users/' + id,
        updateUserDto,
        Constants.HTTP_OPTIONS
      )
      .pipe(
        tap((user) => {
          this.loggedInUser$.next(user);
          this.selectedUser$.next(user);
        })
      );
  }

  delete(id: string) {
    return this.http.delete(Constants.API_URL + '/users/' + id);
  }

  logout() {
    window.localStorage.removeItem('user');
  }
}
